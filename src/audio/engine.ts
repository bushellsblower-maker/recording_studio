import { DEFAULTS, RANGES } from '../defaults';
import type {
  AutoPoint,
  EngineSnapshot,
  FolderId,
  InputMode,
  LaunchQuant,
  Levels,
  MarkerSnapshot,
  MicState,
  SynthSettings,
  ToneShape,
  TrackKind,
  TransportMode,
} from '../types';
import { TRACK_COUNT } from '../types';
import { renderBounce } from './bounce';
import { makeImpulse, makeNoiseBuffer } from './impulse';
import { readMeter, readReduction } from './meters';
import { Metronome } from './metronome';
import { computePeaks } from './peaks';
import {
  INSERT_COUNT,
  SCENE_COUNT,
  clampParams,
  createPlugin,
  isPluginKind,
  pluginInfo,
  wireInserts,
  type LivePlugin,
  type PluginKind,
} from './plugins';
import { loadProject, saveProject, type StoredClip, type StoredProject, type StoredSlot } from './project';
import { type HeldNote, startNote } from './synth';
import { clamp, clampRange, dbToGain, formatBeatPosition, formatTime, musicalPosition } from './units';
import { concatFloat32, encodeStereoWav, sumStereo } from './wav';
import { WORKLET_SOURCE } from './worklets';

export interface StudioListener {
  onStatus: (message: string) => void;
  onChange: () => void;
}

interface Graph {
  inputSum: GainNode;
  micGain: GainNode;
  toneGain: GainNode;
  preamp: GainNode;
  inputMeter: AnalyserNode;
  hpf: BiquadFilterNode;
  polarity: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  makeup: GainNode;
  channelFader: GainNode;
  panner: StereoPannerNode;
  recordTap: GainNode;
  monitor: GainNode;
  inputAudible: GainNode;
  delaySend: GainNode;
  reverbSend: GainNode;
  delayIn: GainNode;
  delay: DelayNode;
  delayFilter: BiquadFilterNode;
  delayFb: GainNode;
  convolver: ConvolverNode;
  masterSum: GainNode;
  masterFader: GainNode;
  safety: DynamicsCompressorNode;
  masterMute: GainNode;
  masterAnalL: AnalyserNode;
  masterAnalR: AnalyserNode;
  performance: GainNode;
  preview: GainNode;
}

interface SessionSlot {
  buffer: AudioBuffer | null;
  name: string;
  peaks: number[];
  bpm: number | null;
}

interface Track {
  armed: boolean;
  muted: boolean;
  solo: boolean;
  gainDb: number;
  pan: number;
  name: string;
  kind: TrackKind;
  startBeat: number;
  clipBpm: number | null;
  buffer: AudioBuffer | null;
  peaks: number[];
  chunksL: Float32Array[];
  chunksR: Float32Array[];
  samples: number;
  pending: boolean;
  input: GainNode | null;
  fader: GainNode | null;
  panner: StereoPannerNode | null;
  meter: AnalyserNode | null;
  audible: GainNode | null;
  stereoPass: GainNode | null;
  monoPass: GainNode | null;
  delaySendNode: GainNode | null;
  reverbSendNode: GainNode | null;
  mono: boolean;
  folder: FolderId;
  delaySend: number;
  reverbSend: number;
  trimStart: number;
  trimEnd: number;
  fadeInBeats: number;
  fadeOutBeats: number;
  inserts: (LivePlugin | null)[];
  slots: SessionSlot[];
  sessionSlot: number | null;
  volumeAuto: AutoPoint[];
  panAuto: AutoPoint[];
  fxAuto: AutoPoint[];
}

interface HistoryClip {
  buffer: AudioBuffer | null;
  peaks: number[];
  name: string;
  clipBpm: number | null;
  startBeat: number;
  trimStart: number;
  trimEnd: number;
  fadeInBeats: number;
  fadeOutBeats: number;
  slots: SessionSlot[];
  sessionSlot: number | null;
  volumeAuto: AutoPoint[];
  panAuto: AutoPoint[];
  fxAuto: AutoPoint[];
}

interface History {
  clips: HistoryClip[];
  markers: MarkerSnapshot[];
  cueBeat: number;
}

interface PlayingSource {
  node: AudioBufferSourceNode;
  clipBpm: number | null;
  trackIndex: number;
}

interface PendingLaunch {
  index: number;
  slot: number | null;
  at: number;
}

interface ScriptProc extends AudioNode {
  onaudioprocess: ((event: { playbackTime: number; inputBuffer: AudioBuffer }) => void) | null;
}

const SILENT_LEVELS: Levels = {
  inputRms: 0,
  inputPeak: 0,
  masterL: 0,
  masterR: 0,
  masterPeakL: 0,
  masterPeakR: 0,
  reduction: 0,
};

/**
 * Live console graph.
 *
 * source -> preamp -> meter -> HPF -> polarity -> EQ -> gate -> compressor
 *        -> makeup -> channel fader -> pan
 *            |-> record tap (printed to armed audio tracks; ignores monitor)
 *            |-> monitor -> mute/solo -> master, delay send, reverb send
 * playback tracks -> master
 * metronome -> master (cue only, not recorded)
 * sample pads and keys -> master, and into armed instrument tracks while recording
 * master fader -> safety limiter -> mute -> speakers
 */
export class StudioEngine {
  private readonly listener: StudioListener;
  private ctx: AudioContext | null = null;
  private g: Graph | null = null;
  private tracks: Track[];
  private metro: Metronome | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private toneNode: OscillatorNode | AudioBufferSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private gateNode: AudioWorkletNode | null = null;
  private recorder: AudioWorkletNode | null = null;
  private perfRecorder: AudioWorkletNode | null = null;
  private sources: PlayingSource[] = [];
  private voices: AudioBufferSourceNode[] = [];
  private previewNode: AudioBufferSourceNode | null = null;
  private held = new Map<number, HeldNote>();
  private keyLayers: Array<{ buffer: AudioBuffer; rootMidi: number }> | null = null;
  private undoStack: History[] = [];
  private redoStack: History[] = [];
  private launches: PendingLaunch[] = [];
  private meterBufs: Float32Array<ArrayBuffer>[] = [];
  private meterIn: Float32Array<ArrayBuffer> | null = null;
  private meterL: Float32Array<ArrayBuffer> | null = null;
  private meterR: Float32Array<ArrayBuffer> | null = null;
  private powerPromise: Promise<void> | null = null;
  private reverbTimer = 0;

  private online = false;
  private graphFailed = false;
  private gateAvailable = false;
  private recorderReady = false;
  private usingWorklet = false;
  private mode: TransportMode = 'stopped';
  private micState: MicState = 'off';
  private acceptChunks = false;
  private commitOnEnd = false;
  private scriptRecording = false;
  private captureNotBefore = 0;
  private captureEpoch = 0;
  private scriptEpoch = 0;
  private rollStart = 0;
  private playDuration = 0;

  private inputMode: InputMode = DEFAULTS.inputMode;
  private toneShape: ToneShape = DEFAULTS.toneShape;
  private toneHz = DEFAULTS.toneHz;
  private toneDb = DEFAULTS.toneDb;
  private monitorDb = DEFAULTS.monitorDb;
  private preampDb = DEFAULTS.preampDb;
  private hpfHz = DEFAULTS.hpfHz;
  private polarity = DEFAULTS.polarity;
  private pan = DEFAULTS.pan;
  private channelDb = DEFAULTS.channelDb;
  private lowHz = DEFAULTS.lowHz;
  private lowGain = DEFAULTS.lowGain;
  private midHz = DEFAULTS.midHz;
  private midGain = DEFAULTS.midGain;
  private midQ = DEFAULTS.midQ;
  private highHz = DEFAULTS.highHz;
  private highGain = DEFAULTS.highGain;
  private gateOn = DEFAULTS.gateOn;
  private gateThreshold = DEFAULTS.gateThreshold;
  private gateAttack = DEFAULTS.gateAttack;
  private gateRelease = DEFAULTS.gateRelease;
  private compThreshold = DEFAULTS.compThreshold;
  private compRatio = DEFAULTS.compRatio;
  private compAttack = DEFAULTS.compAttack;
  private compRelease = DEFAULTS.compRelease;
  private compKnee = DEFAULTS.compKnee;
  private makeupDb = DEFAULTS.makeupDb;
  private delayTime = DEFAULTS.delayTime;
  private delayFeedback = DEFAULTS.delayFeedback;
  private delayDamp = DEFAULTS.delayDamp;
  private delaySendLevel = DEFAULTS.delaySend;
  private reverbDecay = DEFAULTS.reverbDecay;
  private reverbSendLevel = DEFAULTS.reverbSend;
  private masterDb = DEFAULTS.masterDb;
  private metroOn = DEFAULTS.metroOn;
  private metroBpm = DEFAULTS.metroBpm;
  private metroLevel = DEFAULTS.metroLevel;
  private voiceProcessing = DEFAULTS.voiceProcessing;
  private inputMute = false;
  private inputSolo = false;
  private masterMute = false;
  private loopOn = false;
  private playFromBeat = 0;
  private playToBeat = 16;
  private rangeCustom = false;
  private beatOrigin = 0;
  private loopStartSec = 0;
  private loopLengthSec = 0;
  private rollOriginSec = 0;
  private recordStopAt = 0;
  private cueBeat = 0;
  private countIn = false;
  private punch = false;
  private launchQuant: LaunchQuant = 'bar';
  private markers: MarkerSnapshot[] = [];
  private taps: number[] = [];
  private synth: SynthSettings = {
    wave: 'sawtooth',
    cutoff: 1800,
    resonance: 0.8,
    attack: 0.012,
    release: 0.22,
    level: 0.8,
  };
  private endsGot = 0;
  private pendingEnds = 0;
  private captureClosed = false;
  private scheduledPass = 1;

  constructor(listener: StudioListener) {
    this.listener = listener;
    this.tracks = Array.from({ length: TRACK_COUNT }, (_, index) => blankTrack(index));
  }

  powerOn(): Promise<void> {
    if (this.graphFailed) {
      this.status('Audio startup failed. Reload the page and press Power again.');
      return Promise.resolve();
    }
    if (this.powerPromise) return this.powerPromise;
    if (this.online && this.ctx) {
      return this.ctx.resume().then(() => this.listener.onChange());
    }
    this.powerPromise = this.boot().finally(() => {
      this.powerPromise = null;
    });
    return this.powerPromise;
  }

  resume(): void {
    if (this.ctx) void this.ctx.resume();
  }

  snapshot(): EngineSnapshot {
    return {
      powered: this.online,
      sampleRate: this.ctx?.sampleRate ?? 0,
      mode: this.mode,
      mic: this.micState,
      gateAvailable: this.gateAvailable,
      sessionLength: this.sessionLength(),
      tracks: this.tracks.map((track) => ({
        armed: track.armed,
        muted: track.muted,
        solo: track.solo,
        hasAudio: track.buffer !== null,
        duration: this.trackDuration(track),
        name: track.name,
        kind: track.kind,
        startBeat: track.startBeat,
        mono: track.mono,
        folder: track.folder,
        delaySend: track.delaySend,
        reverbSend: track.reverbSend,
        fadeInBeats: track.fadeInBeats,
        fadeOutBeats: track.fadeOutBeats,
        lengthBeats: this.clipSpansFor(track).lengthBeats,
        inserts: track.inserts.map((insert) =>
          insert
            ? { kind: insert.kind, bypass: insert.bypassed, params: { ...insert.values } }
            : null,
        ),
        slots: track.slots.map((slot) => (slot.buffer ? { name: slot.name, hasAudio: true } : null)),
        sessionSlot: track.sessionSlot,
        volumeAuto: track.volumeAuto.map((point) => ({ ...point })),
        panAuto: track.panAuto.map((point) => ({ ...point })),
        fxAuto: track.fxAuto.map((point) => ({ ...point })),
      })),
      contextState: this.ctx?.state ?? 'unpowered',
      inputMute: this.inputMute,
      inputSolo: this.inputSolo,
      masterMute: this.masterMute,
      metroOn: this.metroOn,
      loopOn: this.loopOn,
      playFromBeat: this.playFromBeat,
      playToBeat: this.playToBeat,
      rangeCustom: this.rangeCustom,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      countIn: this.countIn,
      punch: this.punch,
      launchQuant: this.launchQuant,
      cueBeat: this.cueBeat,
      markers: this.markers.map((marker) => ({ ...marker })),
      synth: { ...this.synth },
    };
  }

  levels(): Levels {
    if (!this.g || !this.meterIn || !this.meterL || !this.meterR) return SILENT_LEVELS;
    const input = readMeter(this.g.inputMeter, this.meterIn);
    const left = readMeter(this.g.masterAnalL, this.meterL);
    const right = readMeter(this.g.masterAnalR, this.meterR);
    return {
      inputRms: input.rms,
      inputPeak: input.peak,
      masterL: left.rms,
      masterR: right.rms,
      masterPeakL: left.peak,
      masterPeakR: right.peak,
      reduction: readReduction(this.g.compressor),
    };
  }

  clock(): { seconds: number; label: 'POS' | 'LEN'; bar: number; beat: number } {
    if (this.mode !== 'stopped' && this.ctx && this.rollStart > 0) {
      const elapsed = Math.max(0, this.ctx.currentTime - this.rollStart);
      const musical =
        this.loopOn && this.loopLengthSec > 0
          ? this.loopStartSec + (elapsed % this.loopLengthSec)
          : this.rollOriginSec + elapsed;
      const position = musicalPosition(musical, this.metroBpm);
      return { seconds: musical, label: 'POS', bar: position.bar, beat: position.beat };
    }
    const position = musicalPosition(0, this.metroBpm);
    return { seconds: this.sessionLength(), label: 'LEN', bar: position.bar, beat: position.beat };
  }

  audioContext(): AudioContext | null {
    return this.ctx;
  }

  trackMeters(): number[] {
    return this.trackMeterReadings().map((reading) => reading.peak);
  }

  trackMeterReadings(): { peak: number; rms: number }[] {
    return this.tracks.map((track, index) => {
      const buffer = this.meterBufs[index];
      if (!track.meter || !buffer) return { peak: 0, rms: 0 };
      const reading = readMeter(track.meter, buffer);
      return { peak: reading.peak, rms: reading.rms };
    });
  }

  deviceFrame(index: number): { reductions: number[]; eq: number[] | null } {
    const track = this.tracks[index];
    if (!track) return { reductions: [], eq: null };
    let eq: number[] | null = null;
    const reductions = track.inserts.map((insert) => {
      if (!insert || insert.bypassed) return 0;
      if (insert.kind === 'eq') {
        const curve = insert.curve(72);
        if (curve) eq = Array.from(curve);
      }
      return Math.abs(insert.reduction());
    });
    return { reductions, eq };
  }

  setTrackKind(index: number, kind: TrackKind): void {
    const track = this.tracks[index];
    if (!track || track.kind === kind) return;
    if (this.mode === 'recording' || this.mode === 'stopping') {
      this.status('Stop recording before changing the track type.');
      return;
    }
    track.kind = kind;
    this.status(`Track ${index + 1} prints ${kind === 'instrument' ? 'pads and keys' : 'the channel'}.`);
    this.listener.onChange();
  }

  setTrackStartBeat(index: number, beat: number): void {
    const track = this.tracks[index];
    if (!track) return;
    if (this.mode === 'recording' || this.mode === 'stopping') {
      this.status('Stop recording before moving a clip.');
      return;
    }
    const next = Math.max(0, Math.min(256, beat));
    if (track.startBeat === next) return;
    this.stash();
    track.startBeat = next;
    if (this.mode === 'playing') this.play();
    else this.listener.onChange();
  }

  setPlayRange(fromBeat: number, toBeat: number, loop?: boolean): void {
    if (this.mode === 'recording' || this.mode === 'stopping') {
      this.status('Stop the transport before changing the play range.');
      this.listener.onChange();
      return;
    }
    const from = clamp(fromBeat, 0, 256);
    const to = clamp(Math.max(from + 0.25, toBeat), 0, 256);
    this.playFromBeat = from;
    this.playToBeat = to;
    this.rangeCustom = true;
    if (loop !== undefined) this.loopOn = loop;
    if (this.mode === 'playing') this.play();
    else {
      this.status(this.loopOn ? `Looping ${this.rangePhrase()}.` : `Play range set, ${this.rangePhrase()}.`);
      this.listener.onChange();
    }
  }

  clearPlayRange(): void {
    if (this.mode === 'recording' || this.mode === 'stopping') {
      this.status('Stop the transport before changing the play range.');
      this.listener.onChange();
      return;
    }
    this.rangeCustom = false;
    this.loopOn = false;
    this.playFromBeat = 0;
    this.playToBeat = 16;
    if (this.mode === 'playing') this.play();
    else {
      this.status('Playback uses the whole arrangement.');
      this.listener.onChange();
    }
  }

  loopSelection(startBeat: number, lengthBeats: number): void {
    if (this.mode === 'recording' || this.mode === 'stopping') {
      this.status('Stop the transport before changing the play range.');
      this.listener.onChange();
      return;
    }
    if (lengthBeats < 0.05) {
      this.status('Highlight a track that has a clip, then loop that selection.');
      this.listener.onChange();
      return;
    }
    this.playFromBeat = clamp(startBeat, 0, 256);
    this.playToBeat = clamp(this.playFromBeat + lengthBeats, this.playFromBeat + 0.25, 256);
    this.rangeCustom = true;
    this.loopOn = true;
    if (this.mode === 'playing') this.play();
    else {
      this.status(`Looping the selection, ${this.rangePhrase()}.`);
      this.listener.onChange();
    }
  }

  sessionLength(): number {
    let longest = 0;
    for (const track of this.tracks) longest = Math.max(longest, this.clipWallStart(track) + this.clipWallLength(track));
    return longest;
  }

  durations(): number[] {
    return this.tracks.map((track) => this.clipWallLength(track));
  }

  bpm(): number {
    return this.metroBpm;
  }

  loopStartBeat(): number {
    return this.playFromBeat;
  }

  loopLengthBeats(): number {
    return Math.max(0.25, this.playToBeat - this.playFromBeat);
  }

  isLooping(): boolean {
    return this.loopOn;
  }

  rangeIsCustom(): boolean {
    return this.rangeCustom;
  }

  clipSpans(): { startBeat: number; lengthBeats: number }[] {
    return this.tracks.map((track) => this.clipSpansFor(track));
  }

  peaks(): readonly (readonly number[])[] {
    return this.tracks.map((track) => track.peaks);
  }

  modeName(): TransportMode {
    return this.mode;
  }

  contextState(): AudioContextState | 'unpowered' {
    return this.ctx?.state ?? 'unpowered';
  }

  sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  poll(): void {
    if (!this.ctx) return;
    this.flushLaunches();
    if (this.mode === 'recording') {
      if (this.usesRange() && this.recordStopAt > 0 && this.ctx.currentTime >= this.recordStopAt) {
        this.stop();
      }
      return;
    }
    if (this.mode !== 'playing') return;
    if (this.loopOn && this.loopLengthSec > 0) {
      const elapsed = this.ctx.currentTime - this.rollStart;
      let guard = 0;
      while (elapsed + 0.06 >= this.scheduledPass * this.loopLengthSec && guard < 8) {
        this.handoff(this.rollStart + this.scheduledPass * this.loopLengthSec);
        guard += 1;
      }
      return;
    }
    if (!Number.isFinite(this.playDuration)) return;
    if (this.ctx.currentTime < this.rollStart + this.playDuration) return;
    this.metro?.stop();
    this.stopSources();
    this.mode = 'stopped';
    this.status('Playback finished.');
    this.listener.onChange();
  }

  async enableMic(): Promise<void> {
    if (!this.ensureOnline()) return;
    if (this.micState === 'pending') return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.micState = 'error';
      this.status('This page cannot open a microphone. Use localhost or HTTPS, or record the tone generator.');
      this.listener.onChange();
      return;
    }
    const replacing = this.micStream !== null;
    this.micState = 'pending';
    this.status('Requesting microphone…');
    this.listener.onChange();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.voiceProcessing,
          noiseSuppression: this.voiceProcessing,
          autoGainControl: this.voiceProcessing,
        },
      });
      if (!this.ctx) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.attachMic(stream);
      this.micState = 'on';
      this.applyInputRoute();
      this.status(
        this.voiceProcessing
          ? 'Microphone on. Browser voice processing is enabled. Keep MONITOR down unless you are on headphones.'
          : 'Microphone on with voice processing off. Use headphones before raising MONITOR.',
      );
      this.listener.onChange();
    } catch (error) {
      if (replacing && this.micStream) {
        this.micState = 'on';
        this.applyInputRoute();
        this.status('Could not reopen the microphone. The current stream is still on.');
        this.listener.onChange();
        return;
      }
      const mapped = mapMicError(error);
      this.micState = mapped.state;
      this.status(mapped.message);
      this.listener.onChange();
    }
  }

  releaseMic(): void {
    this.releaseMicStream();
    this.micState = 'off';
    this.applyInputRoute();
    this.status('Microphone released. The tone generator is still available.');
    this.listener.onChange();
  }

  setVoiceProcessing(on: boolean): void {
    if (this.voiceProcessing === on) return;
    this.voiceProcessing = on;
    if (this.micState === 'on') {
      this.status('Reopening the microphone with the new voice-processing setting…');
      void this.enableMic();
      return;
    }
    this.status(on ? 'Voice processing will be on the next time you enable the mic.' : 'Voice processing will be off the next time you enable the mic.');
  }

  setInputMode(mode: InputMode): void {
    this.inputMode = mode;
    this.applyInputRoute();
    if (mode === 'mic' && this.micState !== 'on') {
      this.status('Mic input selected. Enable the microphone, or switch back to Tone.');
    } else if (mode === 'tone') {
      this.status('Tone generator selected. Raise MONITOR to audition it live.');
    } else {
      this.status('Mic and tone are both in the channel.');
    }
  }

  setToneShape(shape: ToneShape): void {
    if (this.toneShape === shape) return;
    this.toneShape = shape;
    if (this.inputMode !== 'mic') {
      this.stopTone();
      this.ensureTone();
      this.applyToneGain();
    }
  }

  setToneFrequency(hz: number): void {
    this.toneHz = clampRange(hz, RANGES.toneHz);
    if (this.toneNode instanceof OscillatorNode) this.ramp(this.toneNode.frequency, this.toneHz, 0.01);
  }

  setToneLevel(db: number): void {
    this.toneDb = clampRange(db, RANGES.toneDb);
    this.applyToneGain();
  }

  setMonitorDb(db: number): void {
    this.monitorDb = clampRange(db, RANGES.monitorDb);
    if (this.g) this.ramp(this.g.monitor.gain, dbToGain(this.monitorDb), 0.015);
  }

  setPreampDb(db: number): void {
    this.preampDb = clampRange(db, RANGES.preampDb);
    if (this.g) this.ramp(this.g.preamp.gain, dbToGain(this.preampDb));
  }

  setHpf(hz: number): void {
    this.hpfHz = clampRange(hz, RANGES.hpfHz);
    if (this.g) this.ramp(this.g.hpf.frequency, this.hpfHz);
  }

  setPolarity(inverted: boolean): void {
    this.polarity = inverted;
    if (this.g && this.ctx) this.g.polarity.gain.setValueAtTime(inverted ? -1 : 1, this.ctx.currentTime);
  }

  setPan(pan: number): void {
    this.pan = clampRange(pan, RANGES.pan);
    if (this.g) this.ramp(this.g.panner.pan, this.pan, 0.015);
  }

  setChannelDb(db: number): void {
    this.channelDb = clampRange(db, RANGES.channelDb);
    if (this.g) this.ramp(this.g.channelFader.gain, dbToGain(this.channelDb));
  }

  setInputMute(muted: boolean): void {
    this.inputMute = muted;
    this.updateRoutingGains();
    this.listener.onChange();
  }

  setInputSolo(solo: boolean): void {
    this.inputSolo = solo;
    this.updateRoutingGains();
    this.listener.onChange();
  }

  setLowHz(hz: number): void {
    this.lowHz = clampRange(hz, RANGES.lowHz);
    if (this.g) this.ramp(this.g.eqLow.frequency, this.lowHz);
  }

  setLowGain(db: number): void {
    this.lowGain = clampRange(db, RANGES.lowGain);
    if (this.g) this.ramp(this.g.eqLow.gain, this.lowGain);
  }

  setMidHz(hz: number): void {
    this.midHz = clampRange(hz, RANGES.midHz);
    if (this.g) this.ramp(this.g.eqMid.frequency, this.midHz);
  }

  setMidGain(db: number): void {
    this.midGain = clampRange(db, RANGES.midGain);
    if (this.g) this.ramp(this.g.eqMid.gain, this.midGain);
  }

  setMidQ(q: number): void {
    this.midQ = clampRange(q, RANGES.midQ);
    if (this.g) this.ramp(this.g.eqMid.Q, this.midQ);
  }

  setHighHz(hz: number): void {
    this.highHz = clampRange(hz, RANGES.highHz);
    if (this.g) this.ramp(this.g.eqHigh.frequency, this.highHz);
  }

  setHighGain(db: number): void {
    this.highGain = clampRange(db, RANGES.highGain);
    if (this.g) this.ramp(this.g.eqHigh.gain, this.highGain);
  }

  flattenEq(): void {
    this.lowGain = 0;
    this.midGain = 0;
    this.highGain = 0;
    if (!this.g) return;
    this.ramp(this.g.eqLow.gain, 0);
    this.ramp(this.g.eqMid.gain, 0);
    this.ramp(this.g.eqHigh.gain, 0);
  }

  setGateEnabled(on: boolean): void {
    this.gateOn = on;
    this.writeGate('enabled', on ? 1 : 0);
  }

  setGateThreshold(db: number): void {
    this.gateThreshold = clampRange(db, RANGES.gateThreshold);
    this.writeGate('threshold', this.gateThreshold);
  }

  setGateAttack(seconds: number): void {
    this.gateAttack = clampRange(seconds, RANGES.gateAttack);
    this.writeGate('attack', this.gateAttack);
  }

  setGateRelease(seconds: number): void {
    this.gateRelease = clampRange(seconds, RANGES.gateRelease);
    this.writeGate('release', this.gateRelease);
  }

  setCompThreshold(db: number): void {
    this.compThreshold = clampRange(db, RANGES.compThreshold);
    if (this.g) this.ramp(this.g.compressor.threshold, this.compThreshold);
  }

  setCompRatio(ratio: number): void {
    this.compRatio = clampRange(ratio, RANGES.compRatio);
    if (this.g) this.ramp(this.g.compressor.ratio, this.compRatio);
  }

  setCompAttack(seconds: number): void {
    this.compAttack = clampRange(seconds, RANGES.compAttack);
    if (this.g) this.ramp(this.g.compressor.attack, this.compAttack);
  }

  setCompRelease(seconds: number): void {
    this.compRelease = clampRange(seconds, RANGES.compRelease);
    if (this.g) this.ramp(this.g.compressor.release, this.compRelease);
  }

  setCompKnee(db: number): void {
    this.compKnee = clampRange(db, RANGES.compKnee);
    if (this.g) this.ramp(this.g.compressor.knee, this.compKnee);
  }

  setMakeup(db: number): void {
    this.makeupDb = clampRange(db, RANGES.makeupDb);
    if (this.g) this.ramp(this.g.makeup.gain, dbToGain(this.makeupDb));
  }

  setDelayTime(seconds: number): void {
    this.delayTime = clampRange(seconds, RANGES.delayTime);
    if (this.g) this.ramp(this.g.delay.delayTime, this.delayTime);
  }

  setDelayFeedback(amount: number): void {
    this.delayFeedback = clampRange(amount, RANGES.delayFeedback);
    if (this.g) this.ramp(this.g.delayFb.gain, this.delayFeedback);
  }

  setDelayDamp(hz: number): void {
    this.delayDamp = clampRange(hz, RANGES.delayDamp);
    if (this.g) this.ramp(this.g.delayFilter.frequency, this.delayDamp);
  }

  setDelaySend(amount: number): void {
    this.delaySendLevel = clampRange(amount, RANGES.delaySend);
    if (this.g) this.ramp(this.g.delaySend.gain, this.delaySendLevel);
  }

  setReverbDecay(seconds: number): void {
    this.reverbDecay = clampRange(seconds, RANGES.reverbDecay);
    if (!this.ctx || !this.g) return;
    if (this.reverbTimer) window.clearTimeout(this.reverbTimer);
    this.reverbTimer = window.setTimeout(() => {
      if (!this.ctx || !this.g) return;
      this.g.convolver.buffer = makeImpulse(this.ctx, this.reverbDecay);
    }, 90);
  }

  setReverbSend(amount: number): void {
    this.reverbSendLevel = clampRange(amount, RANGES.reverbSend);
    if (this.g) this.ramp(this.g.reverbSend.gain, this.reverbSendLevel);
  }

  setMasterDb(db: number): void {
    this.masterDb = clampRange(db, RANGES.masterDb);
    if (this.g) this.ramp(this.g.masterFader.gain, dbToGain(this.masterDb));
  }

  setMasterMute(muted: boolean): void {
    this.masterMute = muted;
    if (this.g && this.ctx) this.g.masterMute.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
    this.listener.onChange();
  }

  setMetronome(on: boolean): void {
    this.metroOn = on;
    if (!this.metro) {
      this.listener.onChange();
      return;
    }
    if (on && (this.mode === 'playing' || this.mode === 'recording')) {
      this.metro.bpm = this.metroBpm;
      this.metro.level = this.metroLevel;
      this.metro.start(this.ctx ? this.ctx.currentTime + 0.05 : 0);
    } else if (!on) {
      this.metro.stop();
    }
    this.listener.onChange();
  }

  setMetroBpm(bpm: number): void {
    this.metroBpm = clampRange(bpm, RANGES.metroBpm);
    if (this.metro) this.metro.bpm = this.metroBpm;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const source of this.sources) {
      if (!source.clipBpm) continue;
      source.node.playbackRate.setTargetAtTime(this.metroBpm / source.clipBpm, now, 0.03);
    }
  }

  setMetroLevel(level: number): void {
    this.metroLevel = clampRange(level, RANGES.metroLevel);
    if (this.metro) this.metro.level = this.metroLevel;
  }

  setTrackArmed(index: number, armed: boolean): void {
    const track = this.tracks[index];
    if (!track) return;
    if (this.mode === 'recording' || this.mode === 'stopping') {
      this.status('Stop the transport before changing track arming.');
      this.listener.onChange();
      return;
    }
    track.armed = armed;
    this.listener.onChange();
  }

  setTrackMuted(index: number, muted: boolean): void {
    const track = this.tracks[index];
    if (!track) return;
    track.muted = muted;
    this.updateRoutingGains();
    this.listener.onChange();
  }

  setTrackSolo(index: number, solo: boolean): void {
    const track = this.tracks[index];
    if (!track) return;
    track.solo = solo;
    this.updateRoutingGains();
    this.listener.onChange();
  }

  setTrackDb(index: number, db: number): void {
    const track = this.tracks[index];
    if (!track) return;
    track.gainDb = clampRange(db, RANGES.trackDb);
    if (track.volumeAuto.length === 0 && track.fader) this.ramp(track.fader.gain, dbToGain(track.gainDb));
  }

  setTrackPan(index: number, pan: number): void {
    const track = this.tracks[index];
    if (!track) return;
    track.pan = clampRange(pan, RANGES.pan);
    if (track.panAuto.length === 0 && track.panner) this.ramp(track.panner.pan, track.pan, 0.015);
  }

  setTrackMono(index: number, mono: boolean): void {
    const track = this.tracks[index];
    if (!track) return;
    track.mono = mono;
    this.applyMono(track);
    this.listener.onChange();
  }

  setTrackFolder(index: number, folder: FolderId): void {
    const track = this.tracks[index];
    if (!track) return;
    track.folder = folder;
    this.listener.onChange();
  }

  muteFolder(folder: 1 | 2): void {
    const members = this.tracks.filter((track) => track.folder === folder);
    if (members.length === 0) {
      this.status(`No tracks are in group ${folder}.`);
      this.listener.onChange();
      return;
    }
    const mute = members.some((track) => !track.muted);
    for (const track of members) track.muted = mute;
    this.updateRoutingGains();
    this.status(mute ? `Group ${folder} muted.` : `Group ${folder} unmuted.`);
    this.listener.onChange();
  }

  setTrackSend(index: number, which: 'delay' | 'reverb', amount: number): void {
    const track = this.tracks[index];
    if (!track) return;
    const value = clamp(amount, 0, 1);
    if (which === 'delay') {
      track.delaySend = value;
      if (track.delaySendNode) this.ramp(track.delaySendNode.gain, value, 0.02);
    } else {
      track.reverbSend = value;
      if (track.reverbSendNode) this.ramp(track.reverbSendNode.gain, value, 0.02);
    }
  }

  setInsert(index: number, slot: number, kind: PluginKind | null): void {
    const track = this.tracks[index];
    if (!track || slot < 0 || slot >= INSERT_COUNT) return;
    if (!this.ctx) {
      this.status('Press Power before loading a device.');
      return;
    }
    track.inserts[slot]?.dispose();
    track.inserts[slot] = kind ? createPlugin(this.ctx, kind) : null;
    if (!track.inserts.some((insert) => insert)) track.fxAuto = [];
    this.wireTrack(track);
    this.status(kind ? `${pluginInfo(kind).name} on track ${index + 1}, slot ${slot + 1}.` : `Cleared slot ${slot + 1}.`);
    this.listener.onChange();
  }

  moveInsert(index: number, from: number, to: number): void {
    const track = this.tracks[index];
    if (!track || from === to) return;
    if (from < 0 || to < 0 || from >= INSERT_COUNT || to >= INSERT_COUNT) return;
    const next = track.inserts.slice();
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked ?? null);
    track.inserts = next;
    this.wireTrack(track);
    this.listener.onChange();
  }

  setInsertBypass(index: number, slot: number, bypass: boolean): void {
    const insert = this.tracks[index]?.inserts[slot];
    if (!insert) return;
    insert.setBypass(bypass);
    this.listener.onChange();
  }

  setInsertParam(index: number, slot: number, id: string, value: number): void {
    const insert = this.tracks[index]?.inserts[slot];
    if (!insert) return;
    insert.set(id, value);
  }

  applyInsertPreset(index: number, slot: number, preset: string): void {
    const insert = this.tracks[index]?.inserts[slot];
    if (!insert) return;
    const found = pluginInfo(insert.kind).presets.find((item) => item.name === preset);
    if (!found) return;
    const values = clampParams(insert.kind, { ...insert.values, ...found.values });
    for (const [id, value] of Object.entries(values)) insert.set(id, value);
    this.status(`${pluginInfo(insert.kind).name}: ${preset}.`);
    this.listener.onChange();
  }

  setAutoPoint(index: number, lane: 'volume' | 'pan' | 'fx', beat: number, value: number): void {
    const track = this.tracks[index];
    if (!track) return;
    const points = this.lane(track, lane);
    const at = clamp(beat, 0, 256);
    const next = clampAuto(lane, track, value);
    const near = points.findIndex((point) => Math.abs(point.beat - at) < 0.35);
    if (near >= 0) points[near] = { beat: at, value: next };
    else points.push({ beat: at, value: next });
    points.sort((a, b) => a.beat - b.beat);
    this.reschedule();
    this.listener.onChange();
  }

  removeAutoPoint(index: number, lane: 'volume' | 'pan' | 'fx', beat: number): void {
    const track = this.tracks[index];
    if (!track) return;
    const points = this.lane(track, lane);
    const near = points.findIndex((point) => Math.abs(point.beat - beat) < 0.45);
    if (near < 0) return;
    points.splice(near, 1);
    this.reschedule();
    this.listener.onChange();
  }

  clearAutomation(index: number, lane: 'volume' | 'pan' | 'fx'): void {
    const track = this.tracks[index];
    if (!track) return;
    this.stash();
    this.lane(track, lane).splice(0, this.lane(track, lane).length);
    this.reschedule();
    this.listener.onChange();
  }

  editClipEdge(index: number, edge: 'start' | 'end' | 'fade-in' | 'fade-out', beat: number): void {
    const track = this.tracks[index];
    if (!track?.buffer) return;
    if (this.mode === 'recording' || this.mode === 'stopping') return;
    const span = this.clipSpansFor(track);
    const rate = Math.max(0.001, this.clipRate(track));
    const secondsPerBeat = this.secondsPerBeat();
    if (edge === 'start') {
      const delta = beat - track.startBeat;
      const nextTrim = track.trimStart + delta * secondsPerBeat * rate;
      const end = track.trimEnd > 0 ? track.trimEnd : track.buffer.duration;
      if (nextTrim < 0 || nextTrim > end - 0.02) return;
      this.stash();
      track.trimStart = nextTrim;
      track.startBeat = Math.max(0, beat);
    } else if (edge === 'end') {
      this.stash();
      const lengthBeats = Math.max(0.25, beat - track.startBeat);
      track.trimEnd = Math.min(track.buffer.duration, track.trimStart + lengthBeats * secondsPerBeat * rate);
    } else if (edge === 'fade-in') {
      this.stash();
      track.fadeInBeats = clamp(beat - span.startBeat, 0, Math.max(0, span.lengthBeats * 0.5));
    } else {
      this.stash();
      const endBeat = span.startBeat + span.lengthBeats;
      track.fadeOutBeats = clamp(endBeat - beat, 0, Math.max(0, span.lengthBeats * 0.5));
    }
    if (this.mode === 'playing') this.play();
    else this.listener.onChange();
  }

  addMarker(beat?: number): void {
    const at = clamp(beat ?? this.musicalBeat(), 0, 256);
    this.stash();
    const marker: MarkerSnapshot = { id: `m-${Date.now()}-${this.markers.length}`, beat: at, name: `Mark ${this.markers.length + 1}` };
    this.markers.push(marker);
    this.markers.sort((a, b) => a.beat - b.beat);
    this.status(`Marker at ${formatBeatPosition(at)}.`);
    this.listener.onChange();
  }

  removeMarker(id: string): void {
    const next = this.markers.filter((marker) => marker.id !== id);
    if (next.length === this.markers.length) return;
    this.stash();
    this.markers = next;
    this.listener.onChange();
  }

  locate(beat: number): void {
    if (this.mode === 'recording' || this.mode === 'stopping') {
      this.status('Stop recording before moving the locator.');
      return;
    }
    const at = clamp(beat, 0, 256);
    if (this.loopOn || this.rangeCustom) {
      const length = Math.max(0.25, this.playToBeat - this.playFromBeat);
      this.setPlayRange(at, at + length, this.loopOn);
      return;
    }
    this.cueBeat = at;
    if (this.mode === 'playing') this.play();
    else {
      this.status(`Cue ${formatBeatPosition(at)}. Play starts there.`);
      this.listener.onChange();
    }
  }

  setCountIn(on: boolean): void {
    this.countIn = on;
    this.status(on ? 'Count-in is one bar.' : 'Count-in off.');
    this.listener.onChange();
  }

  setPunch(on: boolean): void {
    this.punch = on;
    this.status(on ? 'Punch records inside the play range, with a one-bar pre-roll when it fits.' : 'Punch off.');
    this.listener.onChange();
  }

  setLaunchQuant(quant: LaunchQuant): void {
    this.launchQuant = quant;
    this.listener.onChange();
  }

  tapTempo(): void {
    const now = performance.now();
    this.taps = this.taps.filter((tap) => now - tap < 2200);
    this.taps.push(now);
    if (this.taps.length < 2) {
      this.status('Tap again to set the tempo.');
      return;
    }
    let sum = 0;
    for (let index = 1; index < this.taps.length; index += 1) sum += (this.taps[index] ?? now) - (this.taps[index - 1] ?? now);
    const bpm = 60000 / Math.max(1, sum / (this.taps.length - 1));
    this.setMetroBpm(bpm);
    this.status(`Tempo ${Math.round(this.metroBpm)} from tap.`);
    this.listener.onChange();
  }

  setSynth(partial: Partial<SynthSettings>): void {
    if (partial.wave) this.synth.wave = partial.wave;
    if (typeof partial.cutoff === 'number') this.synth.cutoff = clamp(partial.cutoff, 80, 12000);
    if (typeof partial.resonance === 'number') this.synth.resonance = clamp(partial.resonance, 0.2, 12);
    if (typeof partial.attack === 'number') this.synth.attack = clamp(partial.attack, 0.002, 0.6);
    if (typeof partial.release === 'number') this.synth.release = clamp(partial.release, 0.02, 1.5);
    if (typeof partial.level === 'number') this.synth.level = clamp(partial.level, 0, 1);
    this.listener.onChange();
  }

  copyClipToSlot(index: number, slot: number): void {
    const track = this.tracks[index];
    if (!track || slot < 0 || slot >= SCENE_COUNT) return;
    if (!track.buffer) {
      this.status('Record or place a clip before filling a scene slot.');
      return;
    }
    this.stash();
    track.slots[slot] = {
      buffer: track.buffer,
      name: track.name || 'Clip',
      peaks: track.peaks.slice(),
      bpm: track.clipBpm,
    };
    this.status(`Scene ${slot + 1} on track ${index + 1} holds ${track.slots[slot]?.name}.`);
    this.listener.onChange();
  }

  clearSlot(index: number, slot: number): void {
    const track = this.tracks[index];
    if (!track || !track.slots[slot]?.buffer) return;
    this.stash();
    track.slots[slot] = emptySlot();
    if (track.sessionSlot === slot) track.sessionSlot = null;
    this.listener.onChange();
  }

  launchSlot(index: number, slot: number): void {
    const track = this.tracks[index];
    if (!track?.slots[slot]?.buffer) {
      this.status('That scene slot is empty. Capture the arrangement clip into it first.');
      return;
    }
    this.queueLaunch(index, slot);
  }

  launchScene(slot: number): void {
    let queued = 0;
    this.tracks.forEach((track, index) => {
      if (!track.slots[slot]?.buffer) return;
      this.queueLaunch(index, slot);
      queued += 1;
    });
    if (queued === 0) this.status(`Scene ${slot + 1} has no clips.`);
    else this.status(`Scene ${slot + 1}: ${queued} clip${queued === 1 ? '' : 's'} ${this.mode === 'playing' || this.mode === 'recording' ? `on the next ${this.launchQuant}` : 'armed'}.`);
  }

  backToArrangement(index: number | null): void {
    const tracks = index === null ? this.tracks.map((_, trackIndex) => trackIndex) : [index];
    let changed = false;
    for (const trackIndex of tracks) {
      const track = this.tracks[trackIndex];
      if (!track || track.sessionSlot === null) continue;
      changed = true;
      if (this.mode === 'playing' || this.mode === 'recording') this.queueLaunch(trackIndex, null);
      else track.sessionSlot = null;
    }
    if (!changed) {
      this.status('Arrangement is already playing.');
      return;
    }
    this.status('Back to the arrangement.');
    if (this.mode === 'stopped') this.listener.onChange();
  }

  async saveProjectFile(): Promise<void> {
    const project = this.captureProject();
    await saveProject(project);
    this.status('Project saved in this browser.');
  }

  async loadProjectFile(): Promise<boolean> {
    if (this.mode === 'recording' || this.mode === 'stopping') {
      this.status('Stop recording before loading a project.');
      return false;
    }
    const project = await loadProject();
    if (!project) {
      this.status('No saved project in this browser.');
      return false;
    }
    if (!this.ensureOnline() || !this.ctx) return false;
    if (this.mode === 'playing') this.stop();
    this.stash();
    this.applyProject(project);
    this.status('Project loaded.');
    this.listener.onChange();
    return true;
  }

  async bounceMix(): Promise<{ blob: Blob; silent: boolean } | null> {
    const rendered = await this.renderOffline();
    if (!rendered) return null;
    let peak = 0;
    const left = rendered.getChannelData(0);
    const right = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left;
    for (let index = 0; index < left.length; index += 1) {
      peak = Math.max(peak, Math.abs(left[index] ?? 0), Math.abs(right[index] ?? 0));
    }
    return { blob: encodeStereoWav(left, right, rendered.sampleRate), silent: peak < 0.0001 };
  }

  async bounceStem(index: number): Promise<Blob | null> {
    const rendered = await this.renderOffline(index);
    if (!rendered) return null;
    const left = rendered.getChannelData(0);
    const right = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left;
    return encodeStereoWav(left, right, rendered.sampleRate);
  }

  setLoop(on: boolean): void {
    if ((this.mode === 'recording' || this.mode === 'stopping') && on !== this.loopOn) {
      this.status('Stop the transport before changing the loop.');
      this.listener.onChange();
      return;
    }
    this.loopOn = on;
    if (this.mode === 'playing') this.play();
    else {
      this.status(on ? `Looping the region, ${this.rangePhrase()}.` : 'Loop off. Playback still follows the play range when one is set.');
      this.listener.onChange();
    }
  }

  undo(): void {
    this.stepHistory('undo');
  }

  redo(): void {
    this.stepHistory('redo');
  }

  loadClip(index: number, buffer: AudioBuffer, info: { name: string; bpm: number | null; startBeat?: number }): boolean {
    const track = this.tracks[index];
    if (!track) return false;
    if (!this.ensureOnline()) return false;
    if (this.mode === 'recording' || this.mode === 'stopping') {
      this.status('Stop recording before loading a clip.');
      return false;
    }
    this.stash();
    track.buffer = buffer;
    track.peaks = computePeaks(buffer);
    track.name = info.name;
    track.clipBpm = info.bpm;
    track.trimStart = 0;
    track.trimEnd = 0;
    track.fadeInBeats = 0;
    track.fadeOutBeats = 0;
    track.sessionSlot = null;
    if (info.startBeat !== undefined) track.startBeat = Math.max(0, Math.min(256, info.startBeat));
    track.pending = false;
    track.chunksL = [];
    track.chunksR = [];
    track.samples = 0;
    if (this.mode === 'playing') this.play();
    const tempo = info.bpm ? ` It follows the ${Math.round(info.bpm)} BPM click.` : '';
    const placed = track.startBeat > 0 ? ` It starts at beat ${formatBeat(track.startBeat)}.` : '';
    this.status(`Loaded ${info.name} on track ${index + 1}.${placed}${tempo}`);
    this.listener.onChange();
    return true;
  }

  async importEncoded(index: number, data: ArrayBuffer, filename: string, startBeat?: number): Promise<void> {
    if (!this.ensureOnline() || !this.ctx) return;
    try {
      const audio = await this.ctx.decodeAudioData(data.slice(0));
      const name = filename.replace(/\.[^.]+$/, '') || filename;
      this.loadClip(index, audio, { name, bpm: null, startBeat });
    } catch {
      this.status('Could not decode that file. Use WAV or MP3.');
    }
  }

  previewBuffer(buffer: AudioBuffer): void {
    if (!this.ensureOnline() || !this.ctx || !this.g) return;
    this.stopPreview();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.g.preview);
    source.start();
    this.previewNode = source;
    source.onended = () => {
      if (this.previewNode === source) this.previewNode = null;
    };
  }

  triggerBuffer(buffer: AudioBuffer, quantize: boolean, velocity = 1): void {
    if (!this.ensureOnline() || !this.ctx || !this.g) return;
    const now = this.ctx.currentTime;
    const when =
      quantize && (this.mode === 'playing' || this.mode === 'recording') ? this.nextBeatTime(now) : now + 0.015;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const level = this.ctx.createGain();
    level.gain.setValueAtTime(clamp(velocity, 0.05, 1), when);
    source.connect(level);
    level.connect(this.g.performance);
    source.start(when);
    source.onended = () => {
      this.voices = this.voices.filter((voice) => voice !== source);
    };
    this.voices.push(source);
    while (this.voices.length > 24) {
      const oldest = this.voices.shift();
      try {
        oldest?.stop();
      } catch {
        /* already stopped */
      }
    }
  }

  /** Null returns the keys to the desk synth. A list plays the nearest sample, pitched to the note. */
  setKeyLayers(layers: Array<{ buffer: AudioBuffer; rootMidi: number }> | null): void {
    for (const midi of [...this.held.keys()]) this.noteOff(midi);
    this.keyLayers = layers && layers.length > 0 ? layers.map((layer) => ({ buffer: layer.buffer, rootMidi: layer.rootMidi })) : null;
  }

  noteOn(midi: number, velocity = 0.9): void {
    if (!this.ensureOnline() || !this.ctx || !this.g) return;
    this.noteOff(midi);
    if (this.keyLayers && this.keyLayers.length > 0) {
      this.held.set(midi, this.startSampleNote(midi, velocity));
      return;
    }
    this.held.set(
      midi,
      startNote(this.ctx, this.g.performance, midi, this.ctx.currentTime, {
        velocity,
        wave: this.synth.wave,
        cutoff: this.synth.cutoff,
        resonance: this.synth.resonance,
        attack: this.synth.attack,
        release: this.synth.release,
        level: this.synth.level,
      }),
    );
  }

  noteOff(midi: number): void {
    const note = this.held.get(midi);
    if (!note) return;
    this.held.delete(midi);
    note.release(this.ctx?.currentTime ?? 0);
  }

  private startSampleNote(midi: number, velocity: number): HeldNote {
    const ctx = this.ctx;
    const graph = this.g;
    const layers = this.keyLayers;
    if (!ctx || !graph || !layers || layers.length === 0) return { release() {} };
    let layer = layers[0]!;
    let best = Math.abs(layer.rootMidi - midi);
    for (const candidate of layers) {
      const distance = Math.abs(candidate.rootMidi - midi);
      if (distance < best || (distance === best && candidate.rootMidi < layer.rootMidi)) {
        layer = candidate;
        best = distance;
      }
    }
    const rate = clamp(2 ** ((midi - layer.rootMidi) / 12), 0.125, 8);
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = layer.buffer;
    source.playbackRate.setValueAtTime(rate, now);
    const amp = ctx.createGain();
    const peak = clamp(velocity, 0.05, 1);
    amp.gain.setValueAtTime(peak, now);
    source.connect(amp);
    amp.connect(graph.performance);
    source.start(now);
    let stopped = false;
    const handle: HeldNote = {
      release(when: number) {
        if (stopped) return;
        stopped = true;
        const at = Math.max(when, now);
        const stopAt = at + 0.08;
        amp.gain.cancelScheduledValues(at);
        amp.gain.setValueAtTime(Math.max(0.0001, peak), at);
        amp.gain.exponentialRampToValueAtTime(0.0001, stopAt);
        try {
          source.stop(stopAt + 0.02);
        } catch {
          // The sample already ended.
        }
      },
    };
    source.onended = () => {
      stopped = true;
      if (this.held.get(midi) === handle) this.held.delete(midi);
    };
    return handle;
  }

  record(): void {
    if (!this.ensureOnline() || !this.ctx) return;
    void this.ctx.resume();
    if (this.mode === 'recording') return;
    if (this.mode === 'stopping') {
      this.status('Finishing the previous take…');
      return;
    }
    if (!this.recorderReady) {
      this.status('Recording is unavailable in this browser. Playback processing still works.');
      return;
    }
    const armed = this.tracks.filter((track) => track.armed);
    if (armed.length === 0) {
      this.status('Arm at least one track before recording.');
      return;
    }
    if (this.mode === 'playing') {
      this.metro?.stop();
      this.stopSources();
    }
    this.stash();
    this.prepareLoopWindow();
    const origin = this.usesRange() ? this.playFromBeat : this.cueBeat;
    const countSec = this.countIn ? this.secondsPerBeat() * 4 : 0;
    const preBeats = this.punch && this.usesRange() ? Math.min(4, this.playFromBeat) : 0;
    const regionBeat = this.usesRange() ? Math.max(0, this.playFromBeat - preBeats) : this.cueBeat;
    const regionStart = regionBeat * this.secondsPerBeat();
    const punchDelay = Math.max(0, (this.usesRange() ? this.playFromBeat : regionBeat) * this.secondsPerBeat() - regionStart);
    for (const track of this.tracks) {
      if (!track.armed) continue;
      track.pending = true;
      track.buffer = null;
      track.peaks = [];
      track.name = '';
      track.clipBpm = null;
      track.startBeat = origin;
      track.chunksL = [];
      track.chunksR = [];
      track.samples = 0;
    }
    const id = ++this.captureEpoch;
    const startAt = this.ctx.currentTime + 0.18 + countSec;
    this.captureNotBefore = startAt + punchDelay;
    this.acceptChunks = true;
    this.commitOnEnd = true;
    this.mode = 'recording';
    this.startCapture(this.captureNotBefore, id);
    this.startPlayback(startAt, true, regionStart);
    const endSec = this.usesRange() ? this.playToBeat * this.secondsPerBeat() : regionStart + 60 * 30;
    this.recordStopAt = this.usesRange() ? startAt + Math.max(0.05, endSec - regionStart) : 0;
    if ((this.metroOn || this.countIn) && this.metro) {
      this.metro.bpm = this.metroBpm;
      this.metro.level = this.metroLevel;
      this.metro.start(startAt - countSec);
    }
    const playing = this.tracks.filter((track) => !track.armed && track.buffer).length;
    const noun = armed.length === 1 ? 'track' : 'tracks';
    const audioArmed = armed.some((track) => track.kind === 'audio');
    const instrumentArmed = armed.some((track) => track.kind === 'instrument');
    let message = playing
      ? `Recording ${armed.length} armed ${noun} over ${playing} playing back.`
      : `Recording ${armed.length} armed ${noun}.`;
    if (this.usesRange()) message += ` The take runs ${this.rangePhrase()} and then stops.`;
    if (this.countIn) message += ' One-bar count-in first.';
    if (preBeats > 0) message += ' Punch pre-roll is one bar.';
    if (instrumentArmed) message += ' Instrument tracks print pads and keys.';
    if (audioArmed && !this.inputLooksActive()) {
      message += ' Input looks silent — enable the mic or raise the tone level.';
    }
    this.status(message);
    this.listener.onChange();
  }

  play(): void {
    if (!this.ensureOnline() || !this.ctx) return;
    void this.ctx.resume();
    if (this.mode === 'recording') {
      this.stop();
      return;
    }
    if (this.mode === 'stopping') {
      this.status('Finishing the take…');
      return;
    }
    this.prepareLoopWindow();
    const hasAudio = this.sessionLength() > 0;
    const sessioning = this.tracks.some((track) => this.sessionBuffer(track));
    const origin = this.usesRange() ? this.loopStartSec : this.cueBeat * this.secondsPerBeat();
    if (this.usesRange()) this.playDuration = this.loopLengthSec;
    else if (sessioning) this.playDuration = Number.POSITIVE_INFINITY;
    else this.playDuration = hasAudio ? Math.max(0.05, this.sessionLength() - origin) : Number.POSITIVE_INFINITY;
    if (this.mode === 'playing') {
      this.metro?.stop();
      this.stopSources();
    }
    const startAt = this.ctx.currentTime + 0.08;
    this.mode = 'playing';
    this.startPlayback(startAt, false, origin);
    if (this.metroOn && this.metro) {
      this.metro.bpm = this.metroBpm;
      this.metro.level = this.metroLevel;
      this.metro.start(startAt);
    }
    if (!hasAudio) this.status('Clock running. Pads quantize to the beat while play is active.');
    else if (this.loopOn) this.status(`Looping ${this.rangePhrase()}.`);
    else if (this.rangeCustom) this.status(`Playing ${this.rangePhrase()}.`);
    else this.status('Playing.');
    this.listener.onChange();
  }

  stop(): void {
    if (!this.ctx) return;
    this.metro?.stop();
    this.stopSources();
    if (this.mode === 'recording') {
      const id = this.captureEpoch;
      this.mode = 'stopping';
      this.listener.onChange();
      this.stopCapture(id);
      return;
    }
    if (this.mode === 'playing') {
      this.mode = 'stopped';
      this.status('Stopped.');
      this.listener.onChange();
    }
  }

  reset(): void {
    if (!this.online || !this.ctx) {
      this.clearTracks();
      this.mode = 'stopped';
      this.status('Tracks cleared.');
      this.listener.onChange();
      return;
    }
    this.metro?.stop();
    this.stopSources();
    const wasCapturing = this.mode === 'recording' || this.mode === 'stopping';
    const id = this.captureEpoch;
    this.captureEpoch += 1;
    this.commitOnEnd = false;
    this.acceptChunks = false;
    this.scriptRecording = false;
    if (wasCapturing && this.recorder) this.recorder.port.postMessage({ type: 'stop', id });
    if (wasCapturing && this.perfRecorder) this.perfRecorder.port.postMessage({ type: 'stop', id });
    if (!wasCapturing) this.stash();
    this.stopVoices();
    this.clearTracks();
    this.mode = 'stopped';
    this.status('Tracks cleared.');
    this.listener.onChange();
  }

  trackWav(index: number): Blob | null {
    const track = this.tracks[index];
    if (!track?.buffer) return null;
    const left = track.buffer.getChannelData(0);
    const right = track.buffer.numberOfChannels > 1 ? track.buffer.getChannelData(1) : left;
    return encodeStereoWav(left, right, track.buffer.sampleRate);
  }

  mixWav(): { blob: Blob; silent: boolean; scaled: boolean } | null {
    const anySolo = this.tracks.some((track) => track.solo);
    const audible = this.tracks.filter((track) => track.buffer && !track.muted && (!anySolo || track.solo));
    const rate = audible[0]?.buffer?.sampleRate ?? this.sampleRate();
    const parts: { left: Float32Array; right: Float32Array; gainL: number; gainR: number }[] = [];
    for (const track of audible) {
      const rendered = this.renderArranged(track, rate);
      if (!rendered) continue;
      const level = dbToGain(track.gainDb) * dbToGain(this.masterDb);
      const gainL = level * (track.pan <= 0 ? 1 : 1 - track.pan);
      const gainR = level * (track.pan >= 0 ? 1 : 1 + track.pan);
      parts.push({ left: rendered.left, right: rendered.right, gainL, gainR });
    }
    if (parts.length === 0) return null;
    const mixed = sumStereo(parts);
    return {
      blob: encodeStereoWav(mixed.left, mixed.right, rate),
      silent: mixed.peak < 0.0001,
      scaled: mixed.scaled,
    };
  }

  private async boot(): Promise<void> {
    try {
      if (!this.ctx) this.ctx = new AudioContext({ latencyHint: 'interactive' });
      await this.ctx.resume();
      if (!this.g) this.buildGraph();
      await this.loadProcessors();
      this.applyAll();
      await this.ctx.resume();
      this.online = true;
      const fallback = this.usingWorklet
        ? ''
        : ' AudioWorklet was unavailable, so the gate is bypassed and recording uses a compatibility path.';
      this.status(`Console online at ${this.ctx.sampleRate} Hz.${fallback}`);
      this.listener.onChange();
    } catch (error) {
      if (this.g) this.graphFailed = true;
      const detail = error instanceof Error ? error.message : 'unknown error';
      this.status(`Could not start the console (${detail}).`);
      this.listener.onChange();
    }
  }

  private buildGraph(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const stereo = (node: AudioNode): void => {
      node.channelCount = 2;
      node.channelCountMode = 'explicit';
      node.channelInterpretation = 'speakers';
    };

    const inputSum = ctx.createGain();
    stereo(inputSum);
    const micGain = ctx.createGain();
    stereo(micGain);
    micGain.gain.value = 0;
    const toneGain = ctx.createGain();
    stereo(toneGain);
    toneGain.gain.value = 0;
    micGain.connect(inputSum);
    toneGain.connect(inputSum);

    const preamp = ctx.createGain();
    const inputMeter = ctx.createAnalyser();
    inputMeter.fftSize = 1024;
    inputMeter.smoothingTimeConstant = 0;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.Q.value = 0.707;
    const polarity = ctx.createGain();
    polarity.gain.value = 1;
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    const eqMid = ctx.createBiquadFilter();
    eqMid.type = 'peaking';
    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    const compressor = ctx.createDynamicsCompressor();
    const makeup = ctx.createGain();
    const channelFader = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const recordTap = ctx.createGain();
    stereo(recordTap);
    recordTap.gain.value = 1;
    const monitor = ctx.createGain();
    monitor.gain.value = 0;
    const inputAudible = ctx.createGain();
    const delaySend = ctx.createGain();
    delaySend.gain.value = 0;
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0;

    inputSum.connect(preamp);
    preamp.connect(inputMeter);
    inputMeter.connect(hpf);
    hpf.connect(polarity);
    polarity.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(compressor);
    compressor.connect(makeup);
    makeup.connect(channelFader);
    channelFader.connect(panner);
    panner.connect(recordTap);
    panner.connect(monitor);
    monitor.connect(inputAudible);

    const masterSum = ctx.createGain();
    stereo(masterSum);
    inputAudible.connect(masterSum);
    inputAudible.connect(delaySend);
    inputAudible.connect(reverbSend);

    const performance = ctx.createGain();
    stereo(performance);
    performance.gain.value = 0.85;
    performance.connect(masterSum);
    const preview = ctx.createGain();
    stereo(preview);
    preview.gain.value = 0.85;
    preview.connect(masterSum);

    const delayIn = ctx.createGain();
    const delay = ctx.createDelay(2);
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    const delayFb = ctx.createGain();
    const delayWet = ctx.createGain();
    delaySend.connect(delayIn);
    delayIn.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(masterSum);
    delay.connect(delayFilter);
    delayFilter.connect(delayFb);
    delayFb.connect(delayIn);

    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, this.reverbDecay);
    const reverbWet = ctx.createGain();
    reverbSend.connect(convolver);
    convolver.connect(reverbWet);
    reverbWet.connect(masterSum);

    const masterFader = ctx.createGain();
    const safety = ctx.createDynamicsCompressor();
    safety.threshold.value = -1.5;
    safety.knee.value = 0;
    safety.ratio.value = 12;
    safety.attack.value = 0.003;
    safety.release.value = 0.08;
    const masterMute = ctx.createGain();
    masterSum.connect(masterFader);
    masterFader.connect(safety);
    safety.connect(masterMute);
    masterMute.connect(ctx.destination);

    const masterAnalL = ctx.createAnalyser();
    const masterAnalR = ctx.createAnalyser();
    masterAnalL.fftSize = 1024;
    masterAnalR.fftSize = 1024;
    masterAnalL.smoothingTimeConstant = 0;
    masterAnalR.smoothingTimeConstant = 0;
    const splitter = ctx.createChannelSplitter(2);
    const meterSink = ctx.createGain();
    meterSink.gain.value = 0;
    masterFader.connect(splitter);
    splitter.connect(masterAnalL, 0);
    splitter.connect(masterAnalR, 1);
    masterAnalL.connect(meterSink);
    masterAnalR.connect(meterSink);
    meterSink.connect(ctx.destination);

    this.meterBufs = [];
    for (const track of this.tracks) {
      const input = ctx.createGain();
      input.channelCount = 2;
      input.channelCountMode = 'explicit';
      input.channelInterpretation = 'speakers';
      const fader = ctx.createGain();
      const panner = ctx.createStereoPanner();
      const meter = ctx.createAnalyser();
      meter.fftSize = 256;
      meter.smoothingTimeConstant = 0.4;
      const audible = ctx.createGain();
      const stereoPass = ctx.createGain();
      const split = ctx.createChannelSplitter(2);
      const sum = ctx.createGain();
      sum.gain.value = 0.5;
      const merge = ctx.createChannelMerger(2);
      const monoPass = ctx.createGain();
      const delaySendNode = ctx.createGain();
      delaySendNode.gain.value = 0;
      const reverbSendNode = ctx.createGain();
      reverbSendNode.gain.value = 0;
      input.connect(fader);
      fader.connect(panner);
      panner.connect(stereoPass);
      stereoPass.connect(meter);
      panner.connect(split);
      split.connect(sum, 0);
      split.connect(sum, 1);
      sum.connect(merge, 0, 0);
      sum.connect(merge, 0, 1);
      merge.connect(monoPass);
      monoPass.connect(meter);
      meter.connect(audible);
      audible.connect(masterSum);
      audible.connect(delaySendNode);
      audible.connect(reverbSendNode);
      delaySendNode.connect(delayIn);
      reverbSendNode.connect(convolver);
      stereoPass.gain.value = 1;
      monoPass.gain.value = 0;
      track.input = input;
      track.fader = fader;
      track.panner = panner;
      track.meter = meter;
      track.audible = audible;
      track.stereoPass = stereoPass;
      track.monoPass = monoPass;
      track.delaySendNode = delaySendNode;
      track.reverbSendNode = reverbSendNode;
      this.meterBufs.push(new Float32Array(meter.fftSize));
    }

    this.g = {
      inputSum,
      micGain,
      toneGain,
      preamp,
      inputMeter,
      hpf,
      polarity,
      eqLow,
      eqMid,
      eqHigh,
      compressor,
      makeup,
      channelFader,
      panner,
      recordTap,
      monitor,
      inputAudible,
      delaySend,
      reverbSend,
      delayIn,
      delay,
      delayFilter,
      delayFb,
      convolver,
      masterSum,
      masterFader,
      safety,
      masterMute,
      masterAnalL,
      masterAnalR,
      performance,
      preview,
    };
    this.noiseBuffer = makeNoiseBuffer(ctx);
    this.metro = new Metronome(ctx, masterSum);
    this.meterIn = new Float32Array(inputMeter.fftSize);
    this.meterL = new Float32Array(masterAnalL.fftSize);
    this.meterR = new Float32Array(masterAnalR.fftSize);
  }

  private async loadProcessors(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !this.g) return;
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } catch {
      this.installScriptRecorder();
      return;
    } finally {
      URL.revokeObjectURL(url);
    }
    try {
      this.installWorkletGate();
      this.gateAvailable = true;
    } catch {
      this.gateAvailable = false;
    }
    try {
      this.installWorkletRecorder();
      this.usingWorklet = true;
    } catch {
      this.installScriptRecorder();
    }
  }

  private installWorkletGate(): void {
    const ctx = this.ctx;
    const graph = this.g;
    if (!ctx || !graph) return;
    const gate = new AudioWorkletNode(ctx, 'studio-gate', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      outputChannelCount: [2],
    });
    graph.eqHigh.disconnect(graph.compressor);
    graph.eqHigh.connect(gate);
    gate.connect(graph.compressor);
    this.gateNode = gate;
  }

  private installWorkletRecorder(): void {
    const ctx = this.ctx;
    const graph = this.g;
    if (!ctx || !graph) return;
    this.recorder = this.makeRecorder(graph.recordTap, 'audio');
    this.perfRecorder = this.makeRecorder(graph.performance, 'instrument');
    this.recorderReady = true;
  }

  private makeRecorder(source: AudioNode, bus: 'audio' | 'instrument'): AudioWorkletNode {
    const ctx = this.ctx;
    if (!ctx) throw new Error('Audio context is not running.');
    const node = new AudioWorkletNode(ctx, 'studio-recorder', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      outputChannelCount: [2],
    });
    node.port.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      const message = data as { type?: string; id?: number; left?: Float32Array; right?: Float32Array };
      if (typeof message.id !== 'number' || message.id !== this.captureEpoch) return;
      if (message.type === 'chunk' && message.left instanceof Float32Array && message.right instanceof Float32Array) {
        if (!this.acceptChunks) return;
        this.append(message.left, message.right, bus);
        return;
      }
      if (message.type === 'end') this.onCaptureEnded(message.id);
    };
    const sink = ctx.createGain();
    sink.gain.value = 0;
    source.connect(node);
    node.connect(sink);
    sink.connect(ctx.destination);
    return node;
  }

  private installScriptRecorder(): void {
    const ctx = this.ctx;
    const graph = this.g;
    if (!ctx || !graph || this.recorderReady) return;
    const factory = ctx.createScriptProcessor;
    if (typeof factory !== 'function') {
      this.recorderReady = false;
      return;
    }
    const attach = (source: AudioNode, bus: 'audio' | 'instrument'): void => {
      const proc = factory.call(ctx, 2048, 2, 2) as ScriptProc;
      proc.onaudioprocess = (event) => {
        if (this.scriptEpoch !== this.captureEpoch) return;
        if (!this.scriptRecording || !this.acceptChunks || !this.ctx) return;
        const input = event.inputBuffer;
        const block = input.duration;
        if (event.playbackTime + block <= this.captureNotBefore) return;
        let offset = 0;
        if (event.playbackTime < this.captureNotBefore) {
          offset = Math.floor((this.captureNotBefore - event.playbackTime) * this.ctx.sampleRate);
        }
        const leftSrc = input.getChannelData(0);
        const rightSrc = input.numberOfChannels > 1 ? input.getChannelData(1) : leftSrc;
        if (offset >= leftSrc.length) return;
        this.append(new Float32Array(leftSrc.subarray(offset)), new Float32Array(rightSrc.subarray(offset)), bus);
      };
      const sink = ctx.createGain();
      sink.gain.value = 0;
      source.connect(proc);
      proc.connect(sink);
      sink.connect(ctx.destination);
    };
    attach(graph.recordTap, 'audio');
    attach(graph.performance, 'instrument');
    this.usingWorklet = false;
    this.recorderReady = true;
  }

  private applyAll(): void {
    const graph = this.g;
    if (!graph || !this.ctx) return;
    this.ramp(graph.preamp.gain, dbToGain(this.preampDb));
    this.ramp(graph.hpf.frequency, this.hpfHz);
    graph.polarity.gain.setValueAtTime(this.polarity ? -1 : 1, this.ctx.currentTime);
    this.ramp(graph.eqLow.frequency, this.lowHz);
    this.ramp(graph.eqLow.gain, this.lowGain);
    this.ramp(graph.eqMid.frequency, this.midHz);
    this.ramp(graph.eqMid.gain, this.midGain);
    this.ramp(graph.eqMid.Q, this.midQ);
    this.ramp(graph.eqHigh.frequency, this.highHz);
    this.ramp(graph.eqHigh.gain, this.highGain);
    this.writeGate('enabled', this.gateOn ? 1 : 0);
    this.writeGate('threshold', this.gateThreshold);
    this.writeGate('attack', this.gateAttack);
    this.writeGate('release', this.gateRelease);
    this.ramp(graph.compressor.threshold, this.compThreshold);
    this.ramp(graph.compressor.ratio, this.compRatio);
    this.ramp(graph.compressor.attack, this.compAttack);
    this.ramp(graph.compressor.release, this.compRelease);
    this.ramp(graph.compressor.knee, this.compKnee);
    this.ramp(graph.makeup.gain, dbToGain(this.makeupDb));
    this.ramp(graph.channelFader.gain, dbToGain(this.channelDb));
    this.ramp(graph.panner.pan, this.pan);
    this.ramp(graph.monitor.gain, dbToGain(this.monitorDb), 0.015);
    this.ramp(graph.delay.delayTime, this.delayTime);
    this.ramp(graph.delayFb.gain, this.delayFeedback);
    this.ramp(graph.delayFilter.frequency, this.delayDamp);
    this.ramp(graph.delaySend.gain, this.delaySendLevel);
    this.ramp(graph.reverbSend.gain, this.reverbSendLevel);
    this.ramp(graph.masterFader.gain, dbToGain(this.masterDb));
    graph.masterMute.gain.setValueAtTime(this.masterMute ? 0 : 1, this.ctx.currentTime);
    if (this.metro) {
      this.metro.bpm = this.metroBpm;
      this.metro.level = this.metroLevel;
    }
    for (const track of this.tracks) {
      if (track.fader && track.volumeAuto.length === 0) this.ramp(track.fader.gain, dbToGain(track.gainDb));
      if (track.panner && track.panAuto.length === 0) this.ramp(track.panner.pan, track.pan, 0.015);
      if (track.delaySendNode) this.ramp(track.delaySendNode.gain, track.delaySend, 0.02);
      if (track.reverbSendNode) this.ramp(track.reverbSendNode.gain, track.reverbSend, 0.02);
      this.applyMono(track);
      this.wireTrack(track);
    }
    this.applyInputRoute();
    this.updateRoutingGains();
  }

  private applyInputRoute(): void {
    const graph = this.g;
    if (!graph || !this.ctx) return;
    const micActive = this.micState === 'on' && this.inputMode !== 'tone';
    this.ramp(graph.micGain.gain, micActive ? 1 : 0, 0.02);
    if (this.inputMode === 'mic') {
      this.stopTone();
      this.ramp(graph.toneGain.gain, 0, 0.02);
      return;
    }
    this.ensureTone();
    this.applyToneGain();
  }

  private applyToneGain(): void {
    if (!this.g) return;
    const active = this.inputMode !== 'mic';
    this.ramp(this.g.toneGain.gain, active ? dbToGain(this.toneDb) : 0, 0.02);
  }

  private ensureTone(): void {
    if (!this.ctx || !this.g || this.toneNode) return;
    if (this.toneShape === 'noise') {
      if (!this.noiseBuffer) return;
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      source.connect(this.g.toneGain);
      source.start();
      this.toneNode = source;
      return;
    }
    const osc = this.ctx.createOscillator();
    osc.type = this.toneShape;
    osc.frequency.setValueAtTime(this.toneHz, this.ctx.currentTime);
    osc.connect(this.g.toneGain);
    osc.start();
    this.toneNode = osc;
  }

  private stopTone(): void {
    const node = this.toneNode;
    this.toneNode = null;
    if (!node) return;
    try {
      node.stop();
    } catch {
      /* already stopped */
    }
    try {
      node.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  private writeGate(name: string, value: number): void {
    const param = this.gateNode?.parameters.get(name);
    if (!param || !this.ctx) return;
    param.setValueAtTime(value, this.ctx.currentTime);
  }

  private updateRoutingGains(): void {
    if (!this.g || !this.ctx) return;
    const now = this.ctx.currentTime;
    const anySolo = this.inputSolo || this.tracks.some((track) => track.solo);
    const inputAudible = !this.inputMute && (!anySolo || this.inputSolo);
    this.g.inputAudible.gain.setTargetAtTime(inputAudible ? 1 : 0, now, 0.008);
    for (const track of this.tracks) {
      if (!track.audible) continue;
      const audible = !track.muted && (!anySolo || track.solo);
      track.audible.gain.setTargetAtTime(audible ? 1 : 0, now, 0.008);
    }
  }

  private ramp(param: AudioParam, value: number, timeConstant = 0.02): void {
    if (!this.ctx) return;
    param.setTargetAtTime(value, this.ctx.currentTime, timeConstant);
  }

  private startCapture(time: number, id: number): void {
    this.endsGot = 0;
    this.captureClosed = false;
    if (this.recorder || this.perfRecorder) {
      let ends = 0;
      if (this.recorder) {
        this.recorder.port.postMessage({ type: 'start', time, id });
        ends += 1;
      }
      if (this.perfRecorder) {
        this.perfRecorder.port.postMessage({ type: 'start', time, id });
        ends += 1;
      }
      this.pendingEnds = Math.max(1, ends);
      return;
    }
    this.scriptEpoch = id;
    this.scriptRecording = true;
    this.pendingEnds = 1;
  }

  private stopCapture(id: number): void {
    if (this.recorder || this.perfRecorder) {
      if (this.recorder) this.recorder.port.postMessage({ type: 'stop', id });
      if (this.perfRecorder) this.perfRecorder.port.postMessage({ type: 'stop', id });
      return;
    }
    this.scriptRecording = false;
    this.onCaptureEnded(id);
  }

  private onCaptureEnded(id: number): void {
    if (id !== this.captureEpoch) return;
    this.endsGot += 1;
    if (this.endsGot < this.pendingEnds) return;
    if (this.captureClosed) return;
    this.captureClosed = true;
    const commit = this.commitOnEnd;
    this.acceptChunks = false;
    this.commitOnEnd = false;
    this.scriptRecording = false;
    if (commit) this.commitTracks();
    else this.discardPending();
    if (this.mode === 'recording' || this.mode === 'stopping') this.mode = 'stopped';
    this.listener.onChange();
  }

  private append(left: Float32Array, right: Float32Array, bus: 'audio' | 'instrument'): void {
    if (!this.acceptChunks) return;
    for (const track of this.tracks) {
      if (!track.pending) continue;
      if (track.kind === 'instrument' && bus !== 'instrument') continue;
      if (track.kind === 'audio' && bus !== 'audio') continue;
      track.chunksL.push(left);
      track.chunksR.push(right);
      track.samples += left.length;
      this.pushPeaks(track, left, right);
    }
  }

  private pushPeaks(track: Track, left: Float32Array, right: Float32Array): void {
    const bucket = 256;
    for (let i = 0; i < left.length; i += bucket) {
      let peak = 0;
      const end = Math.min(left.length, i + bucket);
      for (let j = i; j < end; j++) {
        const absL = Math.abs(left[j] ?? 0);
        const absR = Math.abs(right[j] ?? 0);
        const value = absL > absR ? absL : absR;
        if (value > peak) peak = value;
      }
      track.peaks.push(peak);
    }
  }

  private commitTracks(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    let stored = 0;
    for (const track of this.tracks) {
      if (!track.pending) continue;
      if (track.samples > 0) {
        const left = concatFloat32(track.chunksL, track.samples);
        const right = concatFloat32(track.chunksR, track.samples);
        const buffer = ctx.createBuffer(2, track.samples, ctx.sampleRate);
        buffer.copyToChannel(left, 0);
        buffer.copyToChannel(right, 1);
        track.buffer = buffer;
        track.name = 'Take';
        track.clipBpm = null;
        track.trimStart = 0;
        track.trimEnd = 0;
        track.fadeInBeats = 0;
        track.fadeOutBeats = 0;
        track.sessionSlot = null;
        stored += 1;
      } else {
        track.buffer = null;
        track.peaks = [];
      }
      track.chunksL = [];
      track.chunksR = [];
      track.samples = 0;
      track.pending = false;
    }
    if (stored === 0) {
      this.status('Recording was empty.');
      return;
    }
    const longest = this.sessionLength();
    const warn = longest >= 180 ? ' This take is long and uses a lot of memory.' : '';
    this.status(`Stored ${stored} track${stored === 1 ? '' : 's'} (${formatTime(longest)}).${warn}`);
  }

  private discardPending(): void {
    for (const track of this.tracks) {
      if (!track.pending) continue;
      track.chunksL = [];
      track.chunksR = [];
      track.samples = 0;
      track.pending = false;
      track.peaks = [];
      track.buffer = null;
    }
  }

  private clearTracks(): void {
    for (const track of this.tracks) {
      track.buffer = null;
      track.peaks = [];
      track.name = '';
      track.clipBpm = null;
      track.startBeat = 0;
      track.trimStart = 0;
      track.trimEnd = 0;
      track.fadeInBeats = 0;
      track.fadeOutBeats = 0;
      track.sessionSlot = null;
      track.volumeAuto = [];
      track.panAuto = [];
      track.fxAuto = [];
      track.slots = Array.from({ length: SCENE_COUNT }, () => emptySlot());
      track.chunksL = [];
      track.chunksR = [];
      track.samples = 0;
      track.pending = false;
    }
    this.cueBeat = 0;
  }

  private startPlayback(when: number, skipArmed: boolean, originSec = this.usesRange() ? this.loopStartSec : 0): void {
    this.stopSources();
    this.rollStart = when;
    this.rollOriginSec = originSec;
    this.beatOrigin = when - originSec;
    this.scheduledPass = 1;
    this.spawnPass(when, originSec, skipArmed);
    this.scheduleAutomation(when, originSec);
  }

  private spawnPass(passWhen: number, regionStart: number, skipArmed: boolean): void {
    if (!this.ctx) return;
    const regionEnd = this.usesRange() && this.loopLengthSec > 0 ? regionStart + this.loopLengthSec : Number.POSITIVE_INFINITY;
    this.tracks.forEach((_track, index) => this.spawnOne(index, passWhen, regionStart, regionEnd, skipArmed));
  }

  private spawnOne(index: number, passWhen: number, regionStart: number, regionEnd: number, skipArmed: boolean): void {
    const track = this.tracks[index];
    const ctx = this.ctx;
    if (!track || !ctx || !track.input) return;
    if (skipArmed && track.armed) return;
    const session = this.sessionBuffer(track);
    if (session) {
      const source = ctx.createBufferSource();
      source.buffer = session.buffer;
      source.loop = true;
      const rate = session.bpm ? this.metroBpm / session.bpm : 1;
      source.playbackRate.setValueAtTime(rate, Math.max(ctx.currentTime, passWhen));
      source.connect(track.input);
      const stopAt = Number.isFinite(regionEnd) ? passWhen + Math.max(0.05, regionEnd - regionStart) : 0;
      try {
        source.start(passWhen);
        if (stopAt > passWhen) source.stop(stopAt);
      } catch {
        try {
          source.disconnect();
        } catch {
          /* already disconnected */
        }
        return;
      }
      this.sources.push({ node: source, clipBpm: session.bpm, trackIndex: index });
      return;
    }
    const buffer = track.buffer;
    if (!buffer) return;
    const clipStart = this.clipWallStart(track);
    const clipEnd = clipStart + this.clipWallLength(track);
    const playFrom = Math.max(clipStart, regionStart);
    const playUntil = Math.min(clipEnd, regionEnd);
    if (playUntil - playFrom < 0.005) return;
    const rate = this.clipRate(track);
    const span = this.sourceSpan(track);
    const into = Math.max(0, (playFrom - clipStart) * rate);
    const bufferOffset = Math.min(buffer.duration - 0.001, span.start + into);
    const duration = Math.min(Math.max(0.01, (playUntil - playFrom) * rate), Math.max(0, span.end - bufferOffset));
    if (duration < 0.005 || bufferOffset >= buffer.duration - 0.001) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const rateAt = Math.max(ctx.currentTime, passWhen);
    source.playbackRate.setValueAtTime(rate, rateAt);
    const fade = ctx.createGain();
    source.connect(fade);
    fade.connect(track.input);
    const startTime = passWhen + (playFrom - regionStart);
    const endTime = startTime + (playUntil - playFrom);
    this.scheduleFade(fade.gain, startTime, endTime, track.fadeInBeats * this.secondsPerBeat(), track.fadeOutBeats * this.secondsPerBeat());
    source.onended = () => {
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
    };
    try {
      source.start(startTime, bufferOffset, duration);
    } catch {
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
      return;
    }
    this.sources.push({ node: source, clipBpm: track.clipBpm, trackIndex: index });
  }

  private handoff(when: number): void {
    for (const source of this.sources) {
      try {
        source.node.stop(when);
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    this.scheduledPass += 1;
    this.spawnPass(when, this.loopStartSec, false);
    this.scheduleAutomation(when, this.loopStartSec);
  }

  private stopSources(): void {
    for (const source of this.sources) {
      try {
        source.node.stop();
      } catch {
        /* already stopped */
      }
      try {
        source.node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.sources = [];
  }

  private usesRange(): boolean {
    return this.loopOn || this.rangeCustom;
  }

  private rangePhrase(): string {
    return `${formatBeatPosition(this.playFromBeat)} to ${formatBeatPosition(this.playToBeat)}`;
  }

  private prepareLoopWindow(): void {
    if (!this.usesRange()) {
      this.loopStartSec = 0;
      this.loopLengthSec = 0;
      return;
    }
    const from = Math.max(0, this.playFromBeat);
    const to = Math.max(from + 0.25, this.playToBeat);
    const secondsPerBeat = this.secondsPerBeat();
    this.loopStartSec = from * secondsPerBeat;
    this.loopLengthSec = (to - from) * secondsPerBeat;
  }

  private nextBeatTime(now: number): number {
    const interval = 60 / Math.max(1, this.metroBpm);
    if (this.beatOrigin <= 0) return now + 0.02;
    const elapsed = now - this.beatOrigin;
    const steps = Math.max(0, Math.ceil((elapsed + 0.03) / interval));
    const at = this.beatOrigin + steps * interval;
    return at < now + 0.005 ? at + interval : at;
  }

  private stopPreview(): void {
    const source = this.previewNode;
    this.previewNode = null;
    if (!source) return;
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    try {
      source.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  private stopVoices(): void {
    this.stopPreview();
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        /* already stopped */
      }
    }
    this.voices = [];
    const now = this.ctx?.currentTime ?? 0;
    for (const note of this.held.values()) note.release(now);
    this.held.clear();
  }

  private stash(): void {
    this.undoStack.push(this.captureHistory());
    if (this.undoStack.length > 32) this.undoStack.shift();
    this.redoStack = [];
  }

  private captureHistory(): History {
    return {
      cueBeat: this.cueBeat,
      markers: this.markers.map((marker) => ({ ...marker })),
      clips: this.tracks.map((track) => ({
        buffer: track.buffer,
        peaks: track.peaks.slice(),
        name: track.name,
        clipBpm: track.clipBpm,
        startBeat: track.startBeat,
        trimStart: track.trimStart,
        trimEnd: track.trimEnd,
        fadeInBeats: track.fadeInBeats,
        fadeOutBeats: track.fadeOutBeats,
        sessionSlot: track.sessionSlot,
        volumeAuto: track.volumeAuto.map((point) => ({ ...point })),
        panAuto: track.panAuto.map((point) => ({ ...point })),
        fxAuto: track.fxAuto.map((point) => ({ ...point })),
        slots: track.slots.map((slot) => ({
          buffer: slot.buffer,
          name: slot.name,
          peaks: slot.peaks.slice(),
          bpm: slot.bpm,
        })),
      })),
    };
  }

  private stepHistory(direction: 'undo' | 'redo'): void {
    if (this.mode === 'recording' || this.mode === 'stopping') {
      this.status('Stop recording before undo.');
      return;
    }
    const stack = direction === 'undo' ? this.undoStack : this.redoStack;
    const entry = stack.pop();
    if (!entry) {
      this.status(direction === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.');
      return;
    }
    if (this.mode === 'playing') {
      this.metro?.stop();
      this.stopSources();
      this.mode = 'stopped';
    }
    const other = direction === 'undo' ? this.redoStack : this.undoStack;
    other.push(this.captureHistory());
    this.restoreHistory(entry);
    this.status(direction === 'undo' ? 'Undid the last edit.' : 'Redid the last edit.');
    this.listener.onChange();
  }

  private restoreHistory(entry: History): void {
    this.cueBeat = entry.cueBeat;
    this.markers = entry.markers.map((marker) => ({ ...marker }));
    entry.clips.forEach((clip, index) => {
      const track = this.tracks[index];
      if (!track) return;
      track.buffer = clip.buffer;
      track.peaks = clip.peaks.slice();
      track.name = clip.name;
      track.clipBpm = clip.clipBpm;
      track.startBeat = clip.startBeat;
      track.trimStart = clip.trimStart;
      track.trimEnd = clip.trimEnd;
      track.fadeInBeats = clip.fadeInBeats;
      track.fadeOutBeats = clip.fadeOutBeats;
      track.sessionSlot = clip.sessionSlot;
      track.volumeAuto = clip.volumeAuto.map((point) => ({ ...point }));
      track.panAuto = clip.panAuto.map((point) => ({ ...point }));
      track.fxAuto = clip.fxAuto.map((point) => ({ ...point }));
      track.slots = clip.slots.map((slot) => ({
        buffer: slot.buffer,
        name: slot.name,
        peaks: slot.peaks.slice(),
        bpm: slot.bpm,
      }));
      track.pending = false;
      track.chunksL = [];
      track.chunksR = [];
      track.samples = 0;
    });
  }

  private trackDuration(track: Track): number {
    return this.clipWallLength(track);
  }

  private secondsPerBeat(): number {
    return 60 / Math.max(1, this.metroBpm);
  }

  private clipRate(track: Track): number {
    return track.clipBpm ? this.metroBpm / track.clipBpm : 1;
  }

  private clipWallStart(track: Track): number {
    return Math.max(0, track.startBeat) * this.secondsPerBeat();
  }

  private clipWallLength(track: Track): number {
    if (track.pending && this.ctx) return track.samples / this.ctx.sampleRate;
    if (!track.buffer) return 0;
    const span = this.sourceSpan(track);
    return Math.max(0, span.end - span.start) / Math.max(0.001, this.clipRate(track));
  }

  private renderArranged(track: Track, sampleRate: number): { left: Float32Array; right: Float32Array } | null {
    const buffer = track.buffer;
    if (!buffer || sampleRate <= 0) return null;
    const rate = Math.max(0.001, this.clipRate(track));
    const span = this.sourceSpan(track);
    const start = Math.max(0, Math.round(this.clipWallStart(track) * sampleRate));
    const frames = Math.max(1, Math.ceil(((span.end - span.start) / rate) * sampleRate));
    const left = new Float32Array(start + frames);
    const right = new Float32Array(start + frames);
    const srcL = buffer.getChannelData(0);
    const srcR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : srcL;
    const srcRate = buffer.sampleRate;
    const fadeIn = Math.min(frames, Math.round(track.fadeInBeats * this.secondsPerBeat() * sampleRate));
    const fadeOut = Math.min(frames, Math.round(track.fadeOutBeats * this.secondsPerBeat() * sampleRate));
    for (let i = 0; i < frames; i++) {
      const index = Math.floor(span.start * srcRate + (i * rate * srcRate) / sampleRate);
      if (index < 0 || index >= srcL.length) continue;
      let gain = 1;
      if (fadeIn > 1 && i < fadeIn) gain *= i / fadeIn;
      if (fadeOut > 1 && i > frames - fadeOut) gain *= (frames - i) / fadeOut;
      left[start + i] = (srcL[index] ?? 0) * gain;
      right[start + i] = (srcR[index] ?? 0) * gain;
    }
    return { left, right };
  }

  private clipSpansFor(track: Track): { startBeat: number; lengthBeats: number } {
    return {
      startBeat: track.startBeat,
      lengthBeats: this.clipWallLength(track) / this.secondsPerBeat(),
    };
  }

  private sourceSpan(track: Track): { start: number; end: number } {
    const buffer = track.buffer;
    if (!buffer) return { start: 0, end: 0 };
    const end = track.trimEnd > 0 ? Math.min(buffer.duration, track.trimEnd) : buffer.duration;
    const start = Math.min(Math.max(0, track.trimStart), Math.max(0, end - 0.01));
    return { start, end: Math.max(start + 0.01, end) };
  }

  private sessionBuffer(track: Track): { buffer: AudioBuffer; bpm: number | null } | null {
    if (track.sessionSlot === null) return null;
    const slot = track.slots[track.sessionSlot];
    if (!slot?.buffer) return null;
    return { buffer: slot.buffer, bpm: slot.bpm };
  }

  private wireTrack(track: Track): void {
    if (!track.input || !track.fader) return;
    wireInserts(track.input, track.inserts, track.fader);
  }

  private applyMono(track: Track): void {
    if (!track.stereoPass || !track.monoPass || !this.ctx) return;
    const now = this.ctx.currentTime;
    track.stereoPass.gain.setTargetAtTime(track.mono ? 0 : 1, now, 0.01);
    track.monoPass.gain.setTargetAtTime(track.mono ? 1 : 0, now, 0.01);
  }

  private lane(track: Track, lane: 'volume' | 'pan' | 'fx'): AutoPoint[] {
    if (lane === 'volume') return track.volumeAuto;
    if (lane === 'pan') return track.panAuto;
    return track.fxAuto;
  }

  private reschedule(): void {
    if (!this.ctx || (this.mode !== 'playing' && this.mode !== 'recording')) return;
    const elapsed = Math.max(0, this.ctx.currentTime - this.rollStart);
    this.scheduleAutomation(this.ctx.currentTime, this.rollOriginSec + elapsed);
  }

  private scheduleAutomation(when: number, originSec: number): void {
    const originBeat = originSec / this.secondsPerBeat();
    const spb = this.secondsPerBeat();
    for (const track of this.tracks) {
      if (track.fader) {
        if (track.volumeAuto.length === 0) this.ramp(track.fader.gain, dbToGain(track.gainDb));
        else this.ride(track.fader.gain, track.volumeAuto, dbToGain(track.gainDb), when, originBeat, spb, true);
      }
      if (track.panner) {
        if (track.panAuto.length === 0) this.ramp(track.panner.pan, track.pan, 0.01);
        else this.ride(track.panner.pan, track.panAuto, track.pan, when, originBeat, spb, false);
      }
      const insert = track.inserts.find((item) => item && !item.bypassed) ?? null;
      if (!insert || track.fxAuto.length === 0) continue;
      const info = pluginInfo(insert.kind);
      const param = insert.param(info.autoParam);
      if (!param) continue;
      this.ride(param, track.fxAuto, insert.values[info.autoParam] ?? 0, when, originBeat, spb, false);
    }
  }

  private ride(
    param: AudioParam,
    points: readonly AutoPoint[],
    fallback: number,
    when: number,
    originBeat: number,
    spb: number,
    asDb: boolean,
  ): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    const convert = (value: number): number => (asDb ? dbToGain(value) : value);
    const sorted = [...points].sort((a, b) => a.beat - b.beat);
    const at = (beat: number): number => {
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (!first || !last) return fallback;
      if (beat <= first.beat) return first.value;
      if (beat >= last.beat) return last.value;
      for (let index = 0; index < sorted.length - 1; index += 1) {
        const left = sorted[index];
        const right = sorted[index + 1];
        if (!left || !right || beat < left.beat || beat > right.beat) continue;
        const span = Math.max(0.0001, right.beat - left.beat);
        return left.value + ((beat - left.beat) / span) * (right.value - left.value);
      }
      return fallback;
    };
    param.setValueAtTime(convert(sorted.length ? at(originBeat) : fallback), Math.max(when, now));
    for (const point of sorted) {
      if (point.beat <= originBeat + 0.0001) continue;
      param.linearRampToValueAtTime(convert(point.value), when + (point.beat - originBeat) * spb);
    }
  }

  private scheduleFade(gain: AudioParam, start: number, end: number, fadeIn: number, fadeOut: number): void {
    const span = Math.max(0.001, end - start);
    const inSec = Math.min(Math.max(0, fadeIn), span * 0.45);
    const outSec = Math.min(Math.max(0, fadeOut), span * 0.45);
    gain.setValueAtTime(inSec > 0.001 ? 0.0001 : 1, start);
    if (inSec > 0.001) gain.linearRampToValueAtTime(1, start + inSec);
    const outAt = Math.max(start + inSec, end - outSec);
    gain.setValueAtTime(1, outAt);
    if (outSec > 0.001) gain.linearRampToValueAtTime(0.0001, end);
  }

  private queueLaunch(index: number, slot: number | null): void {
    const track = this.tracks[index];
    if (!track) return;
    const running = (this.mode === 'playing' || this.mode === 'recording') && this.ctx;
    if (!running) {
      track.sessionSlot = slot;
      this.listener.onChange();
      if (slot !== null) this.status(`Scene ${slot + 1} armed on track ${index + 1}. Press play.`);
      return;
    }
    const at = this.nextQuantizeTime(this.launchQuant === 'bar' ? 4 : 1);
    this.launches = this.launches.filter((launch) => launch.index !== index);
    this.launches.push({ index, slot, at });
    if (slot === null) this.status(`Track ${index + 1} returns to the arrangement on the next ${this.launchQuant}.`);
    else this.status(`Track ${index + 1} launches on the next ${this.launchQuant}.`);
  }

  private flushLaunches(): void {
    if (!this.ctx || this.launches.length === 0) return;
    const now = this.ctx.currentTime;
    const due = this.launches.filter((launch) => launch.at <= now + 0.03);
    if (due.length === 0) return;
    this.launches = this.launches.filter((launch) => launch.at > now + 0.03);
    for (const launch of due) {
      const track = this.tracks[launch.index];
      if (!track) continue;
      track.sessionSlot = launch.slot;
      this.cutTrack(launch.index, launch.at);
      const musical = this.rollOriginSec + Math.max(0, launch.at - this.rollStart);
      const regionEnd = this.usesRange() && this.loopLengthSec > 0 ? this.loopStartSec + this.loopLengthSec : Number.POSITIVE_INFINITY;
      this.spawnOne(launch.index, launch.at, musical, regionEnd, false);
    }
    this.listener.onChange();
  }

  private cutTrack(index: number, when: number): void {
    for (const source of this.sources) {
      if (source.trackIndex !== index) continue;
      try {
        source.node.stop(when);
      } catch {
        /* already stopped */
      }
    }
    this.sources = this.sources.filter((source) => source.trackIndex !== index);
  }

  private nextQuantizeTime(beats: number): number {
    const interval = this.secondsPerBeat() * Math.max(1, beats);
    const now = this.ctx?.currentTime ?? 0;
    if (this.beatOrigin <= 0) return now + 0.05;
    const elapsed = now - this.beatOrigin;
    const steps = Math.max(0, Math.ceil((elapsed + 0.04) / interval));
    let at = this.beatOrigin + steps * interval;
    if (at < now + 0.02) at += interval;
    return at;
  }

  private musicalBeat(): number {
    if ((this.mode === 'playing' || this.mode === 'recording') && this.ctx) {
      return this.clock().seconds / this.secondsPerBeat();
    }
    return this.cueBeat;
  }

  private captureProject(): StoredProject {
    return {
      version: 1,
      savedAt: Date.now(),
      bpm: this.metroBpm,
      masterDb: this.masterDb,
      metroOn: this.metroOn,
      metroLevel: this.metroLevel,
      loopOn: this.loopOn,
      playFromBeat: this.playFromBeat,
      playToBeat: this.playToBeat,
      rangeCustom: this.rangeCustom,
      countIn: this.countIn,
      punch: this.punch,
      launchQuant: this.launchQuant,
      cueBeat: this.cueBeat,
      markers: this.markers.map((marker) => ({ ...marker })),
      synth: { ...this.synth },
      tracks: this.tracks.map((track) => ({
        armed: track.armed,
        muted: track.muted,
        solo: track.solo,
        gainDb: track.gainDb,
        pan: track.pan,
        name: track.name,
        kind: track.kind,
        startBeat: track.startBeat,
        clipBpm: track.clipBpm,
        mono: track.mono,
        folder: track.folder,
        delaySend: track.delaySend,
        reverbSend: track.reverbSend,
        trimStart: track.trimStart,
        trimEnd: track.trimEnd,
        fadeInBeats: track.fadeInBeats,
        fadeOutBeats: track.fadeOutBeats,
        volumeAuto: track.volumeAuto.map((point) => ({ ...point })),
        panAuto: track.panAuto.map((point) => ({ ...point })),
        fxAuto: track.fxAuto.map((point) => ({ ...point })),
        sessionSlot: track.sessionSlot,
        inserts: track.inserts.map((insert) =>
          insert ? { kind: insert.kind, bypass: insert.bypassed, params: { ...insert.values } } : null,
        ),
        clip: bufferToStored(track.buffer),
        slots: track.slots.map((slot) => {
          const clip = bufferToStored(slot.buffer);
          if (!clip) return null;
          const stored: StoredSlot = { name: slot.name, bpm: slot.bpm, clip };
          return stored;
        }),
      })),
    };
  }

  private applyProject(project: StoredProject): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.metroBpm = clampRange(project.bpm, RANGES.metroBpm);
    this.masterDb = clampRange(project.masterDb, RANGES.masterDb);
    this.metroOn = project.metroOn;
    this.metroLevel = clampRange(project.metroLevel, RANGES.metroLevel);
    this.loopOn = project.loopOn;
    this.playFromBeat = project.playFromBeat;
    this.playToBeat = Math.max(project.playFromBeat + 0.25, project.playToBeat);
    this.rangeCustom = project.rangeCustom;
    this.countIn = project.countIn;
    this.punch = project.punch;
    this.launchQuant = project.launchQuant === 'beat' ? 'beat' : 'bar';
    this.cueBeat = Math.max(0, project.cueBeat);
    this.markers = Array.isArray(project.markers) ? project.markers.map((marker) => ({ ...marker })) : [];
    this.synth = { ...this.synth, ...project.synth };
    if (this.metro) {
      this.metro.bpm = this.metroBpm;
      this.metro.level = this.metroLevel;
    }
    project.tracks.forEach((stored, index) => {
      const track = this.tracks[index];
      if (!track) return;
      track.armed = stored.armed;
      track.muted = stored.muted;
      track.solo = stored.solo;
      track.gainDb = stored.gainDb;
      track.pan = stored.pan;
      track.name = stored.name;
      track.kind = stored.kind === 'instrument' ? 'instrument' : 'audio';
      track.startBeat = stored.startBeat;
      track.clipBpm = stored.clipBpm;
      track.mono = stored.mono;
      track.folder = stored.folder === 1 || stored.folder === 2 ? stored.folder : 0;
      track.delaySend = clamp(stored.delaySend, 0, 1);
      track.reverbSend = clamp(stored.reverbSend, 0, 1);
      track.trimStart = Math.max(0, stored.trimStart);
      track.trimEnd = Math.max(0, stored.trimEnd);
      track.fadeInBeats = Math.max(0, stored.fadeInBeats);
      track.fadeOutBeats = Math.max(0, stored.fadeOutBeats);
      track.volumeAuto = stored.volumeAuto.map((point) => ({ ...point }));
      track.panAuto = stored.panAuto.map((point) => ({ ...point }));
      track.fxAuto = stored.fxAuto.map((point) => ({ ...point }));
      track.sessionSlot = stored.sessionSlot;
      track.buffer = stored.clip ? storedToBuffer(ctx, stored.clip) : null;
      track.peaks = track.buffer ? computePeaks(track.buffer) : [];
      track.pending = false;
      track.chunksL = [];
      track.chunksR = [];
      track.samples = 0;
      for (const insert of track.inserts) insert?.dispose();
      track.inserts = stored.inserts.map((insert) => {
        if (!insert || !isPluginKind(insert.kind)) return null;
        const plugin = createPlugin(ctx, insert.kind);
        plugin.setBypass(insert.bypass);
        const params = clampParams(insert.kind, insert.params);
        for (const [id, value] of Object.entries(params)) plugin.set(id, value);
        return plugin;
      });
      while (track.inserts.length < INSERT_COUNT) track.inserts.push(null);
      track.inserts.length = INSERT_COUNT;
      track.slots = stored.slots.map((slot) => {
        if (!slot) return emptySlot();
        const buffer = storedToBuffer(ctx, slot.clip);
        return { buffer, name: slot.name, peaks: buffer ? computePeaks(buffer) : [], bpm: slot.bpm };
      });
      while (track.slots.length < SCENE_COUNT) track.slots.push(emptySlot());
      track.slots.length = SCENE_COUNT;
      this.wireTrack(track);
    });
    this.applyAll();
  }

  private async renderOffline(stemIndex?: number): Promise<AudioBuffer | null> {
    const anySolo = this.tracks.some((track) => track.solo);
    const tracks = [];
    for (let index = 0; index < this.tracks.length; index += 1) {
      const track = this.tracks[index];
      if (!track?.buffer) continue;
      if (stemIndex !== undefined && stemIndex !== index) continue;
      if (stemIndex === undefined && (track.muted || (anySolo && !track.solo))) continue;
      const span = this.sourceSpan(track);
      tracks.push({
        buffer: track.buffer,
        rate: this.clipRate(track),
        startSec: this.clipWallStart(track),
        trimStart: span.start,
        trimEnd: span.end,
        fadeInSec: track.fadeInBeats * this.secondsPerBeat(),
        fadeOutSec: track.fadeOutBeats * this.secondsPerBeat(),
        gain: dbToGain(track.gainDb),
        pan: track.pan,
        mono: track.mono,
        delaySend: track.delaySend,
        reverbSend: track.reverbSend,
        volumeAuto: track.volumeAuto.map((point) => ({ ...point })),
        panAuto: track.panAuto.map((point) => ({ ...point })),
        inserts: track.inserts
          .filter((insert): insert is LivePlugin => insert !== null)
          .map((insert) => ({ kind: insert.kind, bypass: insert.bypassed, params: { ...insert.values } })),
      });
    }
    if (tracks.length === 0) return null;
    let end = 0.5;
    for (const track of tracks) {
      const span = Math.max(0, track.trimEnd - track.trimStart);
      end = Math.max(end, track.startSec + span / Math.max(0.001, track.rate));
    }
    const tail = stemIndex === undefined ? Math.min(4, this.reverbDecay) : 0.05;
    return renderBounce({
      sampleRate: this.sampleRate(),
      duration: end + tail,
      tracks,
      masterGain: stemIndex === undefined ? dbToGain(this.masterDb) : 1,
      delayTime: this.delayTime,
      delayFeedback: this.delayFeedback,
      delayDamp: this.delayDamp,
      reverbDecay: this.reverbDecay,
      bpm: this.metroBpm,
      stemIndex: stemIndex === undefined ? undefined : 0,
    });
  }

  private inputLooksActive(): boolean {
    const tone = this.inputMode !== 'mic' && this.toneDb > -59;
    const mic = this.inputMode !== 'tone' && this.micState === 'on';
    return tone || mic;
  }

  private ensureOnline(): boolean {
    if (this.online && this.ctx) return true;
    this.status('Press Power to start the console.');
    return false;
  }

  private status(message: string): void {
    this.listener.onStatus(message);
  }

  private attachMic(stream: MediaStream): void {
    this.releaseMicStream();
    const ctx = this.ctx;
    const graph = this.g;
    if (!ctx || !graph) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.micStream = stream;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(graph.micGain);
    this.micSource = source;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.onended = () => {
      if (this.micStream !== stream) return;
      this.micState = 'missing';
      this.releaseMicStream();
      this.applyInputRoute();
      this.status('Microphone disconnected. The tone generator still works.');
      this.listener.onChange();
    };
  }

  private releaseMicStream(): void {
    this.micSource?.disconnect();
    this.micSource = null;
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;
  }
}

function blankTrack(index: number): Track {
  return {
    armed: index === 0,
    muted: false,
    solo: false,
    gainDb: 0,
    pan: 0,
    name: '',
    kind: index < 4 ? 'audio' : 'instrument',
    startBeat: 0,
    clipBpm: null,
    buffer: null,
    peaks: [],
    chunksL: [],
    chunksR: [],
    samples: 0,
    pending: false,
    input: null,
    fader: null,
    panner: null,
    meter: null,
    audible: null,
    stereoPass: null,
    monoPass: null,
    delaySendNode: null,
    reverbSendNode: null,
    mono: false,
    folder: 0,
    delaySend: 0,
    reverbSend: 0,
    trimStart: 0,
    trimEnd: 0,
    fadeInBeats: 0,
    fadeOutBeats: 0,
    inserts: Array.from({ length: INSERT_COUNT }, () => null),
    slots: Array.from({ length: SCENE_COUNT }, () => emptySlot()),
    sessionSlot: null,
    volumeAuto: [],
    panAuto: [],
    fxAuto: [],
  };
}

function emptySlot(): SessionSlot {
  return { buffer: null, name: '', peaks: [], bpm: null };
}

function clampAuto(lane: 'volume' | 'pan' | 'fx', track: Track, value: number): number {
  if (lane === 'volume') return clampRange(value, RANGES.trackDb);
  if (lane === 'pan') return clampRange(value, RANGES.pan);
  const insert = track.inserts.find((item) => item);
  if (!insert) return value;
  const info = pluginInfo(insert.kind);
  const spec = info.params.find((item) => item.id === info.autoParam);
  return spec ? clamp(value, spec.min, spec.max) : value;
}

function bufferToStored(buffer: AudioBuffer | null): StoredClip | null {
  if (!buffer) return null;
  const channels: Float32Array[] = [];
  for (let index = 0; index < buffer.numberOfChannels; index += 1) {
    channels.push(buffer.getChannelData(index).slice());
  }
  return { sampleRate: buffer.sampleRate, channels };
}

function storedToBuffer(ctx: BaseAudioContext, clip: StoredClip): AudioBuffer | null {
  const first = clip.channels[0];
  if (!first || first.length === 0) return null;
  const buffer = ctx.createBuffer(Math.max(1, clip.channels.length), first.length, clip.sampleRate || ctx.sampleRate);
  clip.channels.forEach((channel, index) => {
    if (index >= buffer.numberOfChannels) return;
    const copy = new Float32Array(new ArrayBuffer(channel.byteLength));
    copy.set(channel);
    buffer.copyToChannel(copy, index);
  });
  return buffer;
}

function formatBeat(beat: number): string {
  const rounded = Math.round(beat * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function mapMicError(error: unknown): { state: MicState; message: string } {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      state: 'denied',
      message: 'Microphone permission denied. Allow it in the site settings, or record with the tone generator.',
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return {
      state: 'missing',
      message: 'No microphone was found. You can still play and record the tone generator.',
    };
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return {
      state: 'busy',
      message: 'The microphone could not be opened. It may be busy in another app. The tone generator still works.',
    };
  }
  return {
    state: 'error',
    message: 'Could not open the microphone. The tone generator still works.',
  };
}
