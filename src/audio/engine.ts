import { DEFAULTS, RANGES } from '../defaults';
import type { EngineSnapshot, InputMode, Levels, MicState, ToneShape, TransportMode } from '../types';
import { TRACK_COUNT } from '../types';
import { makeImpulse, makeNoiseBuffer } from './impulse';
import { readMeter, readReduction } from './meters';
import { Metronome } from './metronome';
import { computePeaks } from './peaks';
import { type HeldNote, startNote } from './synth';
import { clampRange, dbToGain, formatTime, musicalPosition } from './units';
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

interface Track {
  armed: boolean;
  muted: boolean;
  solo: boolean;
  gainDb: number;
  pan: number;
  name: string;
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
}

interface ClipMemory {
  buffer: AudioBuffer | null;
  peaks: number[];
  name: string;
  clipBpm: number | null;
}

interface PlayingSource {
  node: AudioBufferSourceNode;
  clipBpm: number | null;
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
 *            |-> record tap (printed to armed tracks; ignores monitor)
 *            |-> monitor -> mute/solo -> master, delay send, reverb send
 * playback tracks -> master
 * metronome -> master (cue only, not recorded)
 * sample pads and keys -> master, and into the record tap while a take is running
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
  private sources: PlayingSource[] = [];
  private voices: AudioBufferSourceNode[] = [];
  private previewNode: AudioBufferSourceNode | null = null;
  private held = new Map<number, HeldNote>();
  private undoState: { clips: ClipMemory[] } | null = null;
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
  private loopStartBar = 1;
  private loopBars = 2;
  private beatOrigin = 0;
  private loopStartSec = 0;
  private loopLengthSec = 0;

  constructor(listener: StudioListener) {
    this.listener = listener;
    this.tracks = Array.from({ length: TRACK_COUNT }, (_, index) => ({
      armed: index === 0,
      muted: false,
      solo: false,
      gainDb: 0,
      pan: 0,
      name: '',
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
    }));
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
      })),
      contextState: this.ctx?.state ?? 'unpowered',
      inputMute: this.inputMute,
      inputSolo: this.inputSolo,
      masterMute: this.masterMute,
      metroOn: this.metroOn,
      loopOn: this.loopOn,
      canUndo: this.undoState !== null,
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
        this.loopOn && this.loopLengthSec > 0 ? this.loopStartSec + (elapsed % this.loopLengthSec) : elapsed;
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
    return this.tracks.map((track, index) => {
      const buffer = this.meterBufs[index];
      if (!track.meter || !buffer) return 0;
      return readMeter(track.meter, buffer).peak;
    });
  }

  sessionLength(): number {
    let longest = 0;
    for (const track of this.tracks) longest = Math.max(longest, this.trackDuration(track));
    return longest;
  }

  durations(): number[] {
    return this.tracks.map((track) => this.trackDuration(track));
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
    if (this.mode === 'recording') {
      if (this.loopOn && this.loopLengthSec > 0 && this.ctx.currentTime >= this.rollStart + this.loopLengthSec) {
        this.stop();
      }
      return;
    }
    if (this.mode !== 'playing' || this.loopOn || !Number.isFinite(this.playDuration)) return;
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
    if (track.fader) this.ramp(track.fader.gain, dbToGain(track.gainDb));
  }

  setTrackPan(index: number, pan: number): void {
    const track = this.tracks[index];
    if (!track) return;
    track.pan = clampRange(pan, RANGES.pan);
    if (track.panner) this.ramp(track.panner.pan, track.pan, 0.015);
  }

  setLoop(on: boolean): void {
    this.loopOn = on;
    if (this.mode === 'playing') this.play();
    else this.listener.onChange();
  }

  setLoopStartBar(bar: number): void {
    this.loopStartBar = Math.min(64, Math.max(1, Math.round(bar)));
    if (this.mode === 'playing' && this.loopOn) this.play();
  }

  setLoopBars(bars: number): void {
    this.loopBars = bars === 1 || bars === 2 || bars === 4 || bars === 8 ? bars : 2;
    if (this.mode === 'playing' && this.loopOn) this.play();
  }

  undo(): void {
    if (this.mode === 'recording' || this.mode === 'stopping') {
      this.status('Stop recording before undo.');
      return;
    }
    if (!this.undoState) {
      this.status('Nothing to undo.');
      return;
    }
    if (this.mode === 'playing') {
      this.metro?.stop();
      this.stopSources();
      this.mode = 'stopped';
    }
    const clips = this.undoState.clips;
    this.undoState = null;
    clips.forEach((clip, index) => {
      const track = this.tracks[index];
      if (!track) return;
      track.buffer = clip.buffer;
      track.peaks = clip.peaks;
      track.name = clip.name;
      track.clipBpm = clip.clipBpm;
      track.pending = false;
      track.chunksL = [];
      track.chunksR = [];
      track.samples = 0;
    });
    this.status('Restored the previous take.');
    this.listener.onChange();
  }

  loadClip(index: number, buffer: AudioBuffer, info: { name: string; bpm: number | null }): boolean {
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
    track.pending = false;
    track.chunksL = [];
    track.chunksR = [];
    track.samples = 0;
    if (this.mode === 'playing') this.play();
    const tempo = info.bpm ? ` It follows the ${Math.round(info.bpm)} BPM click.` : '';
    this.status(`Loaded ${info.name} on track ${index + 1}.${tempo}`);
    this.listener.onChange();
    return true;
  }

  async importEncoded(index: number, data: ArrayBuffer, filename: string): Promise<void> {
    if (!this.ensureOnline() || !this.ctx) return;
    try {
      const audio = await this.ctx.decodeAudioData(data.slice(0));
      const name = filename.replace(/\.[^.]+$/, '') || filename;
      this.loadClip(index, audio, { name, bpm: null });
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

  triggerBuffer(buffer: AudioBuffer, quantize: boolean): void {
    if (!this.ensureOnline() || !this.ctx || !this.g) return;
    const now = this.ctx.currentTime;
    const when =
      quantize && (this.mode === 'playing' || this.mode === 'recording') ? this.nextBeatTime(now) : now + 0.015;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.g.performance);
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

  noteOn(midi: number): void {
    if (!this.ensureOnline() || !this.ctx || !this.g) return;
    this.noteOff(midi);
    this.held.set(midi, startNote(this.ctx, this.g.performance, midi, this.ctx.currentTime));
  }

  noteOff(midi: number): void {
    const note = this.held.get(midi);
    if (!note) return;
    this.held.delete(midi);
    note.release(this.ctx?.currentTime ?? 0);
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
    for (const track of this.tracks) {
      if (!track.armed) continue;
      track.pending = true;
      track.buffer = null;
      track.peaks = [];
      track.name = '';
      track.clipBpm = null;
      track.chunksL = [];
      track.chunksR = [];
      track.samples = 0;
    }
    const id = ++this.captureEpoch;
    const startAt = this.ctx.currentTime + 0.18;
    this.rollStart = startAt;
    this.captureNotBefore = startAt;
    this.acceptChunks = true;
    this.commitOnEnd = true;
    this.mode = 'recording';
    this.startCapture(startAt, id);
    this.startPlayback(startAt, true);
    if (this.metroOn) {
      if (this.metro) {
        this.metro.bpm = this.metroBpm;
        this.metro.level = this.metroLevel;
        this.metro.start(startAt);
      }
    }
    const playing = this.tracks.filter((track) => !track.armed && track.buffer).length;
    const noun = armed.length === 1 ? 'track' : 'tracks';
    let message = playing
      ? `Recording ${armed.length} armed ${noun} over ${playing} playing back.`
      : `Recording ${armed.length} armed ${noun}.`;
    if (this.loopOn) message += ` The take stops after ${this.loopBars} bar${this.loopBars === 1 ? '' : 's'}.`;
    if (!this.inputLooksActive()) {
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
    if (this.loopOn) this.playDuration = this.loopLengthSec;
    else this.playDuration = hasAudio ? this.sessionLength() : Number.POSITIVE_INFINITY;
    if (this.mode === 'playing') {
      this.metro?.stop();
      this.stopSources();
    }
    const startAt = this.ctx.currentTime + 0.08;
    this.mode = 'playing';
    this.startPlayback(startAt, false);
    if (this.metroOn && this.metro) {
      this.metro.bpm = this.metroBpm;
      this.metro.level = this.metroLevel;
      this.metro.start(startAt);
    }
    if (!hasAudio) this.status('Clock running. Pads quantize to the beat while play is active.');
    else if (this.loopOn) this.status(`Looping ${this.loopBars} bar${this.loopBars === 1 ? '' : 's'} from bar ${this.loopStartBar}.`);
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
    const parts: { left: Float32Array; right: Float32Array; gainL: number; gainR: number }[] = [];
    for (const track of this.tracks) {
      if (!track.buffer) continue;
      const audible = !track.muted && (!anySolo || track.solo);
      if (!audible) continue;
      const left = track.buffer.getChannelData(0);
      const right = track.buffer.numberOfChannels > 1 ? track.buffer.getChannelData(1) : left;
      const level = dbToGain(track.gainDb) * dbToGain(this.masterDb);
      const gainL = level * (track.pan <= 0 ? 1 : 1 - track.pan);
      const gainR = level * (track.pan >= 0 ? 1 : 1 + track.pan);
      parts.push({ left, right, gainL, gainR });
    }
    if (parts.length === 0) return null;
    const mixed = sumStereo(parts);
    const rate = parts[0] ? this.tracks.find((track) => track.buffer)?.buffer?.sampleRate ?? this.sampleRate() : this.sampleRate();
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
    performance.connect(recordTap);
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
      const fader = ctx.createGain();
      const panner = ctx.createStereoPanner();
      const meter = ctx.createAnalyser();
      meter.fftSize = 256;
      meter.smoothingTimeConstant = 0.4;
      const audible = ctx.createGain();
      input.connect(fader);
      fader.connect(panner);
      panner.connect(meter);
      meter.connect(audible);
      audible.connect(masterSum);
      track.input = input;
      track.fader = fader;
      track.panner = panner;
      track.meter = meter;
      track.audible = audible;
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
        this.append(message.left, message.right);
        return;
      }
      if (message.type === 'end') this.onCaptureEnded(message.id);
    };
    const sink = ctx.createGain();
    sink.gain.value = 0;
    graph.recordTap.connect(node);
    node.connect(sink);
    sink.connect(ctx.destination);
    this.recorder = node;
    this.recorderReady = true;
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
      this.append(new Float32Array(leftSrc.subarray(offset)), new Float32Array(rightSrc.subarray(offset)));
    };
    const sink = ctx.createGain();
    sink.gain.value = 0;
    graph.recordTap.connect(proc);
    proc.connect(sink);
    sink.connect(ctx.destination);
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
      if (track.fader) this.ramp(track.fader.gain, dbToGain(track.gainDb));
      if (track.panner) this.ramp(track.panner.pan, track.pan, 0.015);
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
    if (this.recorder) {
      this.recorder.port.postMessage({ type: 'start', time, id });
      return;
    }
    this.scriptEpoch = id;
    this.scriptRecording = true;
  }

  private stopCapture(id: number): void {
    if (this.recorder) {
      this.recorder.port.postMessage({ type: 'stop', id });
      return;
    }
    this.scriptRecording = false;
    this.onCaptureEnded(id);
  }

  private onCaptureEnded(id: number): void {
    if (id !== this.captureEpoch) return;
    const commit = this.commitOnEnd;
    this.acceptChunks = false;
    this.commitOnEnd = false;
    this.scriptRecording = false;
    if (commit) this.commitTracks();
    else this.discardPending();
    if (this.mode === 'recording' || this.mode === 'stopping') this.mode = 'stopped';
    this.listener.onChange();
  }

  private append(left: Float32Array, right: Float32Array): void {
    if (!this.acceptChunks) return;
    for (const track of this.tracks) {
      if (!track.pending) continue;
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
      track.chunksL = [];
      track.chunksR = [];
      track.samples = 0;
      track.pending = false;
    }
  }

  private startPlayback(when: number, skipArmed: boolean): void {
    this.stopSources();
    this.rollStart = when;
    this.beatOrigin = when - this.loopStartSec;
    if (!this.ctx) return;
    for (const track of this.tracks) {
      if (!track.buffer || !track.input) continue;
      if (skipArmed && track.armed) continue;
      const source = this.ctx.createBufferSource();
      source.buffer = track.buffer;
      const rate = track.clipBpm ? this.metroBpm / track.clipBpm : 1;
      source.playbackRate.setValueAtTime(rate, when);
      source.connect(track.input);
      if (!this.scheduleRegion(source, track, when)) {
        source.disconnect();
        continue;
      }
      this.sources.push({ node: source, clipBpm: track.clipBpm });
    }
  }

  /** Returns false when the clip does not overlap the loop region. */
  private scheduleRegion(source: AudioBufferSourceNode, track: Track, when: number): boolean {
    const buffer = track.buffer;
    if (!buffer) return false;
    if (!this.loopOn) {
      source.start(when);
      return true;
    }
    if (track.clipBpm && buffer.duration > 0.2) {
      let offset = (((this.loopStartBar - 1) * 4 * 60) / track.clipBpm) % buffer.duration;
      if (offset >= buffer.duration - 0.001) offset = 0;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
      source.start(when, offset);
      return true;
    }
    const offset = this.loopStartSec;
    if (offset >= buffer.duration - 0.005) return false;
    const available = buffer.duration - offset;
    const region = Math.max(0.01, Math.min(this.loopLengthSec, available));
    source.start(when, offset, region);
    return true;
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

  private prepareLoopWindow(): void {
    if (!this.loopOn) {
      this.loopStartSec = 0;
      this.loopLengthSec = 0;
      return;
    }
    const secondsPerBar = (60 / Math.max(1, this.metroBpm)) * 4;
    this.loopStartSec = (this.loopStartBar - 1) * secondsPerBar;
    this.loopLengthSec = this.loopBars * secondsPerBar;
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
    this.undoState = {
      clips: this.tracks.map((track) => ({
        buffer: track.buffer,
        peaks: track.peaks.slice(),
        name: track.name,
        clipBpm: track.clipBpm,
      })),
    };
  }

  private trackDuration(track: Track): number {
    if (track.pending && this.ctx) return track.samples / this.ctx.sampleRate;
    return track.buffer?.duration ?? 0;
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
