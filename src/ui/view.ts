import type { SampleMeta } from '../audio/library';
import type { PluginKind } from '../audio/plugins';
import { DEFAULTS, RANGES } from '../defaults';
import { formatBarBeat, formatBeatPosition, formatBpm, formatDb, formatHz, formatMeterDb, formatMs, formatPan, formatPercent, formatQ, formatRatio, formatTime, meterPercent } from '../audio/units';
import type { EngineSnapshot, FolderId, InputMode, LaunchQuant, Levels, MicState, SynthSettings, ToneShape } from '../types';
import { TRACK_COUNT } from '../types';
import { createFader, createKnob, type Control } from './controls';
import { buildDevices } from './devices';
import { buildLibrary } from './library';

export interface ConsoleHandlers {
  power: () => void;
  record: () => void;
  stop: () => void;
  play: () => void;
  reset: () => void;
  enableMic: () => void;
  releaseMic: () => void;
  inputMode: (mode: InputMode) => void;
  voiceProcessing: (on: boolean) => void;
  toneShape: (shape: ToneShape) => void;
  toneHz: (hz: number) => void;
  toneDb: (db: number) => void;
  monitorDb: (db: number) => void;
  preampDb: (db: number) => void;
  hpf: (hz: number) => void;
  polarity: (inverted: boolean) => void;
  pan: (value: number) => void;
  channelDb: (db: number) => void;
  inputMute: (muted: boolean) => void;
  inputSolo: (solo: boolean) => void;
  lowHz: (hz: number) => void;
  lowGain: (db: number) => void;
  midHz: (hz: number) => void;
  midGain: (db: number) => void;
  midQ: (q: number) => void;
  highHz: (hz: number) => void;
  highGain: (db: number) => void;
  gate: (on: boolean) => void;
  gateThreshold: (db: number) => void;
  gateAttack: (seconds: number) => void;
  gateRelease: (seconds: number) => void;
  compThreshold: (db: number) => void;
  compRatio: (ratio: number) => void;
  compAttack: (seconds: number) => void;
  compRelease: (seconds: number) => void;
  compKnee: (db: number) => void;
  makeup: (db: number) => void;
  delayTime: (seconds: number) => void;
  delayFeedback: (amount: number) => void;
  delayDamp: (hz: number) => void;
  delaySend: (amount: number) => void;
  reverbDecay: (seconds: number) => void;
  reverbSend: (amount: number) => void;
  masterDb: (db: number) => void;
  masterMute: (muted: boolean) => void;
  metro: (on: boolean) => void;
  metroBpm: (bpm: number) => void;
  metroLevel: (level: number) => void;
  trackArmed: (index: number, armed: boolean) => void;
  trackMuted: (index: number, muted: boolean) => void;
  trackSolo: (index: number, solo: boolean) => void;
  trackDb: (index: number, db: number) => void;
  trackPan: (index: number, pan: number) => void;
  trackKind: (index: number, kind: 'audio' | 'instrument') => void;
  trackStart: (index: number, beat: number) => void;
  trackImport: (index: number, file: File, beat: number) => void;
  trackDropSample: (index: number, sampleId: string, beat: number) => void;
  downloadTrack: (index: number) => void;
  downloadMix: () => void;
  undo: () => void;
  loop: (on: boolean) => void;
  playRange: (fromBeat: number, toBeat: number, loop?: boolean) => void;
  clearRange: () => void;
  loopSelection: (startBeat: number, lengthBeats: number) => void;
  previewSample: (id: string) => void;
  loadSample: (id: string) => void;
  triggerSample: (id: string) => void;
  noteOn: (midi: number, velocity?: number) => void;
  noteOff: (midi: number) => void;
  redo: () => void;
  tap: () => void;
  countIn: (on: boolean) => void;
  punch: (on: boolean) => void;
  saveProject: () => void;
  loadProject: () => void;
  bounce: () => void;
  stems: () => void;
  addMarker: () => void;
  removeMarker: (id: string) => void;
  locate: (beat: number) => void;
  editClipEdge: (index: number, edge: 'start' | 'end' | 'fade-in' | 'fade-out', beat: number) => void;
  setInsert: (track: number, slot: number, kind: PluginKind | null) => void;
  moveInsert: (track: number, from: number, to: number) => void;
  bypassInsert: (track: number, slot: number, bypass: boolean) => void;
  insertParam: (track: number, slot: number, id: string, value: number) => void;
  insertPreset: (track: number, slot: number, name: string) => void;
  trackSend: (track: number, which: 'delay' | 'reverb', amount: number) => void;
  trackMono: (track: number, mono: boolean) => void;
  trackFolder: (track: number, folder: FolderId) => void;
  muteFolder: (folder: 1 | 2) => void;
  copySlot: (track: number, slot: number) => void;
  clearSlot: (track: number, slot: number) => void;
  launchSlot: (track: number, slot: number) => void;
  launchScene: (slot: number) => void;
  backToArrangement: () => void;
  launchQuant: (quant: LaunchQuant) => void;
  autoPoint: (track: number, lane: 'volume' | 'pan' | 'fx', beat: number, value: number) => void;
  removeAuto: (track: number, lane: 'volume' | 'pan' | 'fx', beat: number) => void;
  clearAuto: (track: number, lane: 'volume' | 'pan' | 'fx') => void;
  synth: (partial: Partial<SynthSettings>) => void;
  enableMidi: () => void;
}

export interface PaintFrame extends Levels {
  position: number;
  clockLabel: 'POS' | 'LEN';
  bar: number;
  beat: number;
  sessionLength: number;
  durations: readonly number[];
  peaks: readonly (readonly number[])[];
  trackLevels: readonly number[];
  trackRms: readonly number[];
  reductions: readonly number[];
  eq: readonly number[] | null;
  bpm: number;
  spans: readonly { startBeat: number; lengthBeats: number }[];
  loopStartBeat: number;
  loopBeats: number;
  looping: boolean;
  rangeCustom: boolean;
  recording: boolean;
  playing: boolean;
  suspended: boolean;
}

export interface ConsoleView {
  element: HTMLElement;
  setStatus: (message: string) => void;
  setBooting: (booting: boolean) => void;
  setMonitorWarning: (on: boolean) => void;
  render: (snapshot: EngineSnapshot) => void;
  paint: (frame: PaintFrame) => void;
  setCatalog: (samples: SampleMeta[]) => void;
  catalogFailed: (message: string) => void;
  setBpm: (bpm: number) => void;
  targetTrack: () => number;
  focusTrack: (index: number) => void;
  quantizeOn: () => boolean;
}

const TRACK_COLORS = ['#e15a3a', '#e0a106', '#3cb7a0', '#6c8cff', '#d36ad6', '#7dcea0', '#f39c6b', '#8ecae6'];

type ZoneName = 'arrange' | 'mix' | 'browse' | 'play';

export function buildView(handlers: ConsoleHandlers): ConsoleView {
  const element = document.createElement('div');
  element.className = 'app';

  const status = document.createElement('p');
  status.className = 'status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const suspended = document.createElement('p');
  suspended.className = 'banner';
  suspended.textContent = 'Audio is suspended. Click Power or a transport button to resume.';
  suspended.hidden = true;

  const sampleRate = document.createElement('span');
  sampleRate.className = 'rate';
  sampleRate.textContent = '— kHz';

  const micPill = document.createElement('span');
  micPill.className = 'pill';
  micPill.textContent = 'MIC OFF';

  const powerLed = document.createElement('span');
  powerLed.className = 'led';
  const powerText = document.createElement('span');
  powerText.textContent = 'POWER';
  const power = button('', 'btn power');
  power.append(powerLed, powerText);
  power.addEventListener('click', handlers.power);

  const clockLabel = document.createElement('span');
  clockLabel.className = 'clock-label';
  clockLabel.textContent = 'LEN';
  const clock = document.createElement('span');
  clock.className = 'clock';
  clock.textContent = '00:00.0';
  const bars = document.createElement('span');
  bars.className = 'bars';
  bars.textContent = '001.1';

  const top = document.createElement('header');
  top.className = 'topbar';
  const brand = document.createElement('div');
  brand.className = 'brand';
  const title = document.createElement('h1');
  title.textContent = 'RS-4';
  const sub = document.createElement('p');
  sub.textContent = 'Eight-track console';
  brand.append(title, sub);
  const pills = document.createElement('div');
  pills.className = 'pills';
  pills.append(micPill, sampleRate);
  const sig = document.createElement('span');
  sig.className = 'sig';
  sig.textContent = '4/4';
  sig.title = 'Time signature';
  const clockWrap = document.createElement('div');
  clockWrap.className = 'clock-wrap tool-group';
  clockWrap.append(clockLabel, clock, bars, sig);
  const headLFill = document.createElement('div');
  headLFill.className = 'mini-meter-fill';
  const headRFill = document.createElement('div');
  headRFill.className = 'mini-meter-fill';
  const headL = document.createElement('div');
  headL.className = 'head-meter';
  headL.append(headLFill);
  const headR = document.createElement('div');
  headR.className = 'head-meter';
  headR.append(headRFill);
  const headMeters = document.createElement('div');
  headMeters.className = 'head-meters';
  headMeters.title = 'Master peak, left and right';
  headMeters.append(headL, headR);
  const brandGroup = document.createElement('div');
  brandGroup.className = 'tool-group';
  brandGroup.append(brand, pills);
  top.append(brandGroup, clockWrap, headMeters, power);

  const rec = button('REC', 'btn rec');
  const stop = button('STOP', 'btn stop');
  const play = button('PLAY', 'btn play');
  const undo = button('UNDO', 'btn small');
  const redo = button('REDO', 'btn small');
  const reset = button('RESET', 'btn reset');
  rec.addEventListener('click', handlers.record);
  stop.addEventListener('click', handlers.stop);
  play.addEventListener('click', handlers.play);
  undo.addEventListener('click', handlers.undo);
  redo.addEventListener('click', handlers.redo);
  reset.addEventListener('click', handlers.reset);

  const metro = button('METRO', 'btn small');
  metro.setAttribute('aria-pressed', 'false');
  metro.addEventListener('click', () => {
    if (!last) return;
    handlers.metro(!last.metroOn);
  });
  const quantize = button('QUANT', 'btn small on');
  quantize.setAttribute('aria-pressed', 'true');
  quantize.title = 'Quantize sample pads to the beat while the transport is running';
  quantize.addEventListener('click', () => {
    const next = quantize.getAttribute('aria-pressed') !== 'true';
    quantize.classList.toggle('on', next);
    quantize.setAttribute('aria-pressed', String(next));
  });
  const bpm = knob('BPM', RANGES.metroBpm, DEFAULTS.metroBpm, formatBpm, handlers.metroBpm, 'Metronome tempo');
  const metroLevel = knob('CLICK', RANGES.metroLevel, DEFAULTS.metroLevel, formatPercent, handlers.metroLevel, 'Metronome level');

  const transport = document.createElement('section');
  transport.className = 'transport panel';
  const transportButtons = document.createElement('div');
  transportButtons.className = 'transport-buttons transport-main tool-group';
  transportButtons.append(rec, stop, play, undo, redo, reset);
  const metroBox = document.createElement('div');
  metroBox.className = 'metro tool-group';
  let snapSixteenth = false;
  let laneZoom = 1;
  let viewOrigin = 0;
  let viewSpan = 16;
  function gridFine(shift: boolean): boolean {
    return shift !== snapSixteenth;
  }
  const tap = button('TAP', 'btn small');
  tap.title = 'Tap tempo';
  tap.addEventListener('click', handlers.tap);
  const countIn = button('COUNT', 'btn small');
  countIn.title = 'One-bar count-in before recording';
  countIn.addEventListener('click', () => {
    if (!last) return;
    handlers.countIn(!last.countIn);
  });
  const punch = button('PUNCH', 'btn small');
  punch.title = 'Record inside the play range. Adds a one-bar pre-roll when the range starts after bar 1.';
  punch.addEventListener('click', () => {
    if (!last) return;
    handlers.punch(!last.punch);
  });
  const mark = button('MARK', 'btn small');
  mark.title = 'Drop a locator at the playhead or cue';
  mark.addEventListener('click', handlers.addMarker);
  const saveProject = button('SAVE', 'btn small');
  saveProject.title = 'Save the project in this browser';
  saveProject.addEventListener('click', handlers.saveProject);
  const loadProject = button('LOAD', 'btn small');
  loadProject.title = 'Load the project saved in this browser';
  loadProject.addEventListener('click', handlers.loadProject);
  const bounce = button('BOUNCE', 'btn small');
  bounce.title = 'Render the mix through inserts, fades, sends, and the master';
  bounce.addEventListener('click', handlers.bounce);
  const stems = button('STEMS', 'btn small');
  stems.title = 'Download each track through its inserts, fades, level, and pan';
  stems.addEventListener('click', handlers.stems);
  const midiBtn = button('MIDI', 'btn small');
  midiBtn.title = 'Listen to a Web MIDI keyboard';
  midiBtn.addEventListener('click', handlers.enableMidi);
  const snap = button('SNAP 1', 'btn small');
  snap.title = 'Snap grid. SNAP 1 is beats, SNAP 16 is sixteenths. Shift flips the grid while dragging.';
  snap.setAttribute('aria-pressed', 'true');
  snap.addEventListener('click', () => {
    snapSixteenth = !snapSixteenth;
    snap.textContent = snapSixteenth ? 'SNAP 16' : 'SNAP 1';
    snap.classList.toggle('on', snapSixteenth);
  });
  const zoomOut = button('−', 'btn tiny');
  zoomOut.title = 'Zoom out to show more bars';
  zoomOut.setAttribute('aria-label', 'Zoom out');
  const zoomRead = document.createElement('span');
  zoomRead.className = 'zoom-read';
  zoomRead.textContent = '1×';
  const zoomIn = button('+', 'btn tiny');
  zoomIn.title = 'Zoom in for more detail';
  zoomIn.setAttribute('aria-label', 'Zoom in');
  const applyZoom = (next: number): void => {
    laneZoom = Math.min(4, Math.max(1, next));
    zoomRead.textContent = `${laneZoom}×`;
    zoomIn.disabled = laneZoom >= 4;
    zoomOut.disabled = laneZoom <= 1;
  };
  zoomIn.addEventListener('click', () => applyZoom(laneZoom * 2));
  zoomOut.addEventListener('click', () => applyZoom(laneZoom / 2));
  zoomOut.disabled = true;
  const loopTransport = button('LOOP', 'btn small');
  loopTransport.title = 'Repeat the play range';
  loopTransport.addEventListener('click', () => {
    if (!last) return;
    const next = !last.loopOn;
    if (next && !last.rangeCustom) {
      handlers.playRange(0, Math.max(1, arrangeBeats), true);
      return;
    }
    handlers.loop(next);
  });
  const modes = document.createElement('div');
  modes.className = 'transport-buttons tool-group';
  modes.append(loopTransport, countIn, punch, snap, mark);
  const zoomBox = document.createElement('div');
  zoomBox.className = 'tool-group zoom-box';
  zoomBox.append(zoomOut, zoomRead, zoomIn);
  const projectBox = document.createElement('div');
  projectBox.className = 'transport-buttons tool-group';
  projectBox.append(saveProject, loadProject, bounce, stems, midiBtn);
  metroBox.append(metro, quantize, tap, bpm.root, metroLevel.root);
  transport.append(transportButtons, modes, zoomBox, metroBox, projectBox);

  const micButton = button('Enable microphone', 'btn small wide');
  const voice = checkbox('Browser voice processing (echo / noise / AGC)', DEFAULTS.voiceProcessing);
  voice.input.addEventListener('change', () => handlers.voiceProcessing(voice.input.checked));

  const toneFreq = knob('FREQ', RANGES.toneHz, DEFAULTS.toneHz, formatHz, handlers.toneHz, 'Oscillator frequency');
  const toneLevel = knob('TONE', RANGES.toneDb, DEFAULTS.toneDb, formatDb, handlers.toneDb, 'Tone generator level');
  const monitor = createFader({
    label: 'MONITOR',
    ...RANGES.monitorDb,
    value: DEFAULTS.monitorDb,
    format: formatDb,
    title: 'Live input monitor. Starts off to avoid feedback.',
    onChange: (value) => {
      handlers.monitorDb(value);
      setMonitorWarning(value > -40);
    },
  });
  const monitorWarn = document.createElement('p');
  monitorWarn.className = 'warn';
  monitorWarn.textContent = 'Monitor is up. Use headphones — speakers can feed back into the mic.';
  monitorWarn.hidden = true;

  const shape = select(
    [
      ['sine', 'Sine'],
      ['square', 'Square'],
      ['sawtooth', 'Saw'],
      ['triangle', 'Triangle'],
      ['noise', 'Noise'],
    ],
    DEFAULTS.toneShape,
    'Tone waveform',
  );
  shape.addEventListener('change', () => {
    const value = shape.value;
    if (value === 'sine' || value === 'square' || value === 'sawtooth' || value === 'triangle' || value === 'noise') {
      handlers.toneShape(value);
      toneFreq.root.classList.toggle('is-dim', value === 'noise');
      toneFreq.input.disabled = value === 'noise';
    }
  });

  const modeRadios = (['tone', 'mic', 'both'] as const).map((mode) => {
    const choice = radio('input-mode', mode, mode === 'both' ? 'Mic + tone' : mode === 'mic' ? 'Mic' : 'Tone', mode === DEFAULTS.inputMode);
    choice.input.addEventListener('change', () => {
      if (choice.input.checked) handlers.inputMode(mode);
    });
    return choice.root;
  });

  const inputHelp = note('Monitor is the live input only and starts off. Recorded tracks play through the master.');
  const inputPanel = panel(
    'Input',
    row(...modeRadios),
    micButton,
    voice.root,
    label('Wave'),
    shape,
    row(toneFreq.root, toneLevel.root),
    monitor.root,
    monitorWarn,
    inputHelp,
  );

  const preamp = knob('PRE', RANGES.preampDb, DEFAULTS.preampDb, formatDb, handlers.preampDb, 'Preamp gain');
  const hpf = knob('HPF', RANGES.hpfHz, DEFAULTS.hpfHz, formatHz, handlers.hpf, 'High-pass filter');
  const pan = knob('PAN', RANGES.pan, DEFAULTS.pan, formatPan, handlers.pan, 'Pan');
  const polarity = button('Ø', 'btn small');
  polarity.setAttribute('aria-label', 'Polarity invert');
  polarity.setAttribute('aria-pressed', 'false');
  polarity.addEventListener('click', () => {
    const next = polarity.getAttribute('aria-pressed') !== 'true';
    polarity.classList.toggle('on', next);
    polarity.setAttribute('aria-pressed', String(next));
    handlers.polarity(next);
  });
  const inputMute = button('MUTE', 'btn small');
  const inputSolo = button('SOLO', 'btn small');
  inputMute.addEventListener('click', () => {
    if (!last) return;
    handlers.inputMute(!last.inputMute);
  });
  inputSolo.addEventListener('click', () => {
    if (!last) return;
    handlers.inputSolo(!last.inputSolo);
  });
  const channelFader = createFader({
    label: 'FADER',
    ...RANGES.channelDb,
    value: DEFAULTS.channelDb,
    format: formatDb,
    title: 'Channel fader. This level is printed to armed tracks.',
    onChange: handlers.channelDb,
  });
  const inputMeter = makeMeter('IN', 1);
  const channelMeters = document.createElement('div');
  channelMeters.className = 'strip';
  channelMeters.append(channelFader.root, inputMeter.root);
  const chipPre = insertChip('Pre', true);
  const chipHpf = insertChip('HPF', true);
  const chipEq = insertChip('EQ', true);
  const chipGate = insertChip('Gate', false);
  const chipComp = insertChip('Comp', true);
  const chipDelay = insertChip('Delay', false);
  const chipVerb = insertChip('Verb', false);
  const inserts = document.createElement('div');
  inserts.className = 'inserts';
  inserts.append(chipPre, chipHpf, chipEq, chipGate, chipComp, chipDelay, chipVerb);
  const channelPanel = panel(
    'Channel',
    inserts,
    row(preamp.root, hpf.root, pan.root),
    row(polarity, inputMute, inputSolo),
    channelMeters,
    note('Inserts, fader, and pan are printed on audio tracks. Monitor does not change the take.'),
  );

  const lowHz = knob('LOW', RANGES.lowHz, DEFAULTS.lowHz, formatHz, handlers.lowHz, 'Low shelf frequency');
  const lowGain = knob('GAIN', RANGES.lowGain, DEFAULTS.lowGain, formatDb, handlers.lowGain, 'Low shelf gain');
  const midHz = knob('MID', RANGES.midHz, DEFAULTS.midHz, formatHz, handlers.midHz, 'Mid frequency');
  const midGain = knob('GAIN', RANGES.midGain, DEFAULTS.midGain, formatDb, handlers.midGain, 'Mid gain');
  const midQ = knob('Q', RANGES.midQ, DEFAULTS.midQ, formatQ, handlers.midQ, 'Mid bandwidth');
  const highHz = knob('HIGH', RANGES.highHz, DEFAULTS.highHz, formatHz, handlers.highHz, 'High shelf frequency');
  const highGain = knob('GAIN', RANGES.highGain, DEFAULTS.highGain, formatDb, handlers.highGain, 'High shelf gain');
  const flat = button('FLAT', 'btn small');
  flat.addEventListener('click', () => {
    lowGain.set(0);
    midGain.set(0);
    highGain.set(0);
  });
  const eqPanel = panel(
    'EQ',
    row(lowHz.root, lowGain.root),
    row(midHz.root, midGain.root, midQ.root),
    row(highHz.root, highGain.root),
    flat,
  );

  const gateBtn = button('GATE', 'btn small');
  gateBtn.setAttribute('aria-pressed', 'false');
  gateBtn.addEventListener('click', () => {
    const next = gateBtn.getAttribute('aria-pressed') !== 'true';
    gateBtn.classList.toggle('on', next);
    gateBtn.setAttribute('aria-pressed', String(next));
    handlers.gate(next);
    chipGate.classList.toggle('on', next);
  });
  const gateNote = note('Gate needs AudioWorklet, which this browser did not start.');
  gateNote.hidden = true;
  const gateThreshold = knob('THRESH', RANGES.gateThreshold, DEFAULTS.gateThreshold, formatDb, handlers.gateThreshold, 'Gate threshold');
  const gateAttack = knob('ATK', RANGES.gateAttack, DEFAULTS.gateAttack, formatMs, handlers.gateAttack, 'Gate attack');
  const gateRelease = knob('REL', RANGES.gateRelease, DEFAULTS.gateRelease, formatMs, handlers.gateRelease, 'Gate release');
  const compThreshold = knob('THRESH', RANGES.compThreshold, DEFAULTS.compThreshold, formatDb, handlers.compThreshold, 'Compressor threshold');
  const compRatio = knob('RATIO', RANGES.compRatio, DEFAULTS.compRatio, formatRatio, handlers.compRatio, 'Compressor ratio');
  const compAttack = knob('ATK', RANGES.compAttack, DEFAULTS.compAttack, formatMs, handlers.compAttack, 'Compressor attack');
  const compRelease = knob('REL', RANGES.compRelease, DEFAULTS.compRelease, formatMs, handlers.compRelease, 'Compressor release');
  const compKnee = knob('KNEE', RANGES.compKnee, DEFAULTS.compKnee, formatDb, handlers.compKnee, 'Compressor knee');
  const makeup = knob('MAKEUP', RANGES.makeupDb, DEFAULTS.makeupDb, formatDb, handlers.makeup, 'Makeup gain');
  const gr = makeGr();
  const dynPanel = panel(
    'Dynamics',
    row(gateBtn),
    gateNote,
    row(gateThreshold.root, gateAttack.root, gateRelease.root),
    label('Compressor'),
    row(compThreshold.root, compRatio.root, compAttack.root),
    row(compRelease.root, compKnee.root, makeup.root),
    gr.root,
  );

  const delayTime = knob('TIME', RANGES.delayTime, DEFAULTS.delayTime, formatMs, handlers.delayTime, 'Delay time');
  const delayFeedback = knob('FB', RANGES.delayFeedback, DEFAULTS.delayFeedback, formatPercent, handlers.delayFeedback, 'Delay feedback');
  const delayDamp = knob('DAMP', RANGES.delayDamp, DEFAULTS.delayDamp, formatHz, handlers.delayDamp, 'Delay feedback tone');
  const delaySend = knob('SEND', RANGES.delaySend, DEFAULTS.delaySend, formatPercent, (amount) => {
    handlers.delaySend(amount);
    chipDelay.classList.toggle('on', amount > 0.001);
  }, 'Delay send');
  const reverbDecay = knob('DECAY', RANGES.reverbDecay, DEFAULTS.reverbDecay, (value) => `${value.toFixed(2)} s`, handlers.reverbDecay, 'Reverb decay');
  const reverbSend = knob('SEND', RANGES.reverbSend, DEFAULTS.reverbSend, formatPercent, (amount) => {
    handlers.reverbSend(amount);
    chipVerb.classList.toggle('on', amount > 0.001);
  }, 'Reverb send');
  const fxPanel = panel(
    'FX sends',
    label('Delay'),
    row(delayTime.root, delayFeedback.root),
    row(delayDamp.root, delaySend.root),
    label('Reverb'),
    row(reverbDecay.root, reverbSend.root),
    note('Delay and reverb are monitor sends. They are not printed into the WAV.'),
  );

  const consoleRow = document.createElement('div');
  consoleRow.className = 'console';
  consoleRow.append(inputPanel, channelPanel, eqPanel, dynPanel, fxPanel);

  let targetTrack = 0;
  const library = buildLibrary({
    preview: handlers.previewSample,
    load: handlers.loadSample,
    trigger: handlers.triggerSample,
    noteOn: handlers.noteOn,
    noteOff: handlers.noteOff,
  });

  const tracks: TrackRow[] = [];
  const trackList = document.createElement('div');
  trackList.className = 'tracks';
  let arrangeBeats = 16;
  const dragBeats = new Map<number, number>();
  let dragging: { index: number; origin: number; grab: number; mode: 'move' | 'start' | 'end' | 'fade-in' | 'fade-out' } | null = null;
  let loopPreview: { startBeat: number; endBeat: number } | null = null;
  let rulerAnchor = 0;
  let rulerActive = false;
  let rulerFine = false;
  let rangeEditing = false;
  let spans: { startBeat: number; lengthBeats: number }[] = [];

  const ruler = document.createElement('div');
  ruler.className = 'track ruler-row';
  const rulerLabel = document.createElement('span');
  rulerLabel.className = 'track-name';
  rulerLabel.textContent = 'BARS';
  const rulerCanvas = document.createElement('canvas');
  rulerCanvas.className = 'wave ruler';
  rulerCanvas.setAttribute('aria-hidden', 'true');
  const rulerSig = document.createElement('span');
  rulerSig.className = 'track-time';
  rulerSig.textContent = '4/4';
  const rulerSkip = (label: string): HTMLSpanElement => {
    const span = document.createElement('span');
    span.className = 'ruler-skip';
    span.setAttribute('aria-hidden', 'true');
    span.dataset.slot = label;
    return span;
  };
  ruler.append(rulerLabel, rulerSkip('toggles'), rulerSkip('mix'), rulerCanvas, rulerSig, rulerSkip('actions'));
  rulerCanvas.addEventListener('pointerdown', (event) => {
    if (last?.mode === 'recording' || last?.mode === 'stopping') return;
    rulerCanvas.setPointerCapture(event.pointerId);
    rulerActive = true;
    rulerFine = gridFine(event.shiftKey);
    rulerAnchor = beatFromClient(rulerCanvas, event.clientX);
    loopPreview = rangeFromDrag(rulerAnchor, rulerAnchor, rulerFine);
    event.preventDefault();
  });
  rulerCanvas.addEventListener('pointermove', (event) => {
    if (!rulerActive) return;
    rulerFine = gridFine(event.shiftKey);
    loopPreview = rangeFromDrag(rulerAnchor, beatFromClient(rulerCanvas, event.clientX), rulerFine);
  });
  const finishRuler = (): void => {
    if (!rulerActive || !loopPreview) return;
    const startBeat = loopPreview.startBeat;
    const endBeat = loopPreview.endBeat;
    rulerActive = false;
    loopPreview = null;
    handlers.playRange(startBeat, endBeat, true);
  };
  rulerCanvas.addEventListener('pointerup', finishRuler);
  rulerCanvas.addEventListener('pointercancel', () => {
    rulerActive = false;
    loopPreview = null;
  });
  trackList.append(ruler);

  for (let index = 0; index < TRACK_COUNT; index++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'track';
    if (index === 0) rowEl.classList.add('is-target');
    rowEl.style.setProperty('--track', TRACK_COLORS[index] ?? '#e0a106');
    const name = document.createElement('span');
    name.className = 'track-name';
    name.textContent = index < 4 ? `Audio ${index + 1}` : `Inst ${index + 1}`;
    const clip = document.createElement('span');
    clip.className = 'track-clip';
    clip.textContent = 'empty';
    const id = document.createElement('div');
    id.className = 'track-id';
    id.append(name, clip);
    const arm = button('ARM', 'btn tiny arm');
    arm.setAttribute('aria-label', `Arm track ${index + 1}`);
    const mute = button('M', 'btn tiny');
    mute.setAttribute('aria-label', `Track ${index + 1} mute`);
    const solo = button('S', 'btn tiny');
    solo.setAttribute('aria-label', `Track ${index + 1} solo`);
    arm.addEventListener('click', () => {
      if (!last) return;
      handlers.trackArmed(index, !last.tracks[index]?.armed);
    });
    mute.addEventListener('click', () => {
      if (!last) return;
      handlers.trackMuted(index, !last.tracks[index]?.muted);
    });
    solo.addEventListener('click', () => {
      if (!last) return;
      handlers.trackSolo(index, !last.tracks[index]?.solo);
    });
    const kind = button(index < 4 ? 'AUD' : 'INST', 'btn tiny kind');
    kind.setAttribute('aria-label', `Track ${index + 1} type`);
    kind.title = 'Audio tracks print the channel. Instrument tracks print pads and keys.';
    kind.addEventListener('click', () => {
      if (!last) return;
      const current = last.tracks[index]?.kind ?? 'audio';
      handlers.trackKind(index, current === 'audio' ? 'instrument' : 'audio');
    });
    const toggles = document.createElement('div');
    toggles.className = 'track-toggles';
    toggles.append(arm, mute, solo, kind);
    const level = document.createElement('input');
    level.type = 'range';
    level.min = String(RANGES.trackDb.min);
    level.max = String(RANGES.trackDb.max);
    level.step = String(RANGES.trackDb.step);
    level.value = '0';
    level.setAttribute('aria-label', `Track ${index + 1} level`);
    const levelRead = document.createElement('span');
    levelRead.className = 'track-db';
    levelRead.textContent = '0.0 dB';
    level.addEventListener('input', () => {
      const value = Number(level.value);
      levelRead.textContent = formatDb(value);
      handlers.trackDb(index, value);
    });
    const levelName = document.createElement('span');
    levelName.className = 'mix-k';
    levelName.textContent = 'Level';
    const levelWrap = document.createElement('label');
    levelWrap.className = 'track-level';
    levelWrap.append(levelName, level, levelRead);
    const pan = document.createElement('input');
    pan.type = 'range';
    pan.min = String(RANGES.pan.min);
    pan.max = String(RANGES.pan.max);
    pan.step = String(RANGES.pan.step);
    pan.value = '0';
    pan.setAttribute('aria-label', `Track ${index + 1} pan`);
    const panRead = document.createElement('span');
    panRead.className = 'track-db';
    panRead.textContent = 'C';
    pan.addEventListener('input', () => {
      const value = Number(pan.value);
      panRead.textContent = formatPan(value);
      handlers.trackPan(index, value);
    });
    const panName = document.createElement('span');
    panName.className = 'mix-k';
    panName.textContent = 'Pan';
    const panWrap = document.createElement('label');
    panWrap.className = 'track-level';
    panWrap.append(panName, pan, panRead);
    const mix = document.createElement('div');
    mix.className = 'track-mix';
    mix.append(levelWrap, panWrap);
    const meterFill = document.createElement('div');
    meterFill.className = 'mini-meter-fill';
    const rmsFill = document.createElement('div');
    rmsFill.className = 'mini-meter-fill rms';
    const meter = document.createElement('div');
    meter.className = 'mini-meter';
    meter.append(rmsFill, meterFill);
    mix.append(meter);
    const canvas = document.createElement('canvas');
    canvas.className = 'wave';
    canvas.setAttribute('aria-hidden', 'true');
    const time = document.createElement('span');
    time.className = 'track-time';
    time.textContent = '00:00.0';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'audio/*,.wav,.mp3,.ogg,.flac,.m4a';
    file.hidden = true;
    const importer = button('IMP', 'btn tiny');
    importer.setAttribute('aria-label', `Import audio onto track ${index + 1}`);
    importer.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const picked = file.files?.[0];
      file.value = '';
      if (picked) handlers.trackImport(index, picked, 0);
    });
    const download = button('WAV', 'btn tiny');
    download.setAttribute('aria-label', `Download track ${index + 1} WAV`);
    download.addEventListener('click', () => handlers.downloadTrack(index));
    const actions = document.createElement('div');
    actions.className = 'track-actions';
    actions.append(importer, download, file);
    rowEl.addEventListener('click', (event) => {
      const hit = event.target;
      if (hit instanceof HTMLElement && hit.closest('button, input, label')) return;
      chooseTrack(index);
    });
    rowEl.addEventListener('dragover', (event) => {
      event.preventDefault();
      rowEl.classList.add('is-drop');
    });
    rowEl.addEventListener('dragleave', () => rowEl.classList.remove('is-drop'));
    rowEl.addEventListener('drop', (event) => {
      event.preventDefault();
      rowEl.classList.remove('is-drop');
      chooseTrack(index);
      const sampleId = event.dataTransfer?.getData('application/x-rs-sample');
      const dropped = event.dataTransfer?.files?.[0];
      const beat = snapBeat(beatFromClient(canvas, event.clientX), gridFine(event.shiftKey));
      if (sampleId) handlers.trackDropSample(index, sampleId, beat);
      else if (dropped) handlers.trackImport(index, dropped, beat);
    });
    canvas.addEventListener('pointerdown', (event) => {
      if (last?.mode === 'recording' || last?.mode === 'stopping') return;
      const span = spans[index];
      if (!span || span.lengthBeats <= 0) return;
      const beat = beatFromClient(canvas, event.clientX);
      const origin = dragBeats.get(index) ?? span.startBeat;
      const end = origin + span.lengthBeats;
      if (beat < origin - 0.05 || beat > end + 0.05) return;
      const rect = canvas.getBoundingClientRect();
      const edge = Math.max(0.2, (12 / Math.max(1, rect.width)) * viewSpan);
      let mode: 'move' | 'start' | 'end' | 'fade-in' | 'fade-out' = 'move';
      if (event.altKey) mode = beat < origin + span.lengthBeats * 0.5 ? 'fade-in' : 'fade-out';
      else if (beat <= origin + edge) mode = 'start';
      else if (beat >= end - edge) mode = 'end';
      dragging = { index, origin, grab: beat - origin, mode };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!dragging || dragging.index !== index || !canvas.hasPointerCapture(event.pointerId)) return;
      if (dragging.mode === 'move') dragBeats.set(index, snapBeat(beatFromClient(canvas, event.clientX) - dragging.grab, gridFine(event.shiftKey)));
    });
    const finishDrag = (event: PointerEvent): void => {
      if (!dragging || dragging.index !== index) return;
      const mode = dragging.mode;
      const beat = mode === 'move' ? (dragBeats.get(index) ?? dragging.origin) : snapBeat(beatFromClient(canvas, event.clientX), gridFine(event.shiftKey));
      dragging = null;
      dragBeats.delete(index);
      if (mode === 'move') handlers.trackStart(index, beat);
      else handlers.editClipEdge(index, mode, beat);
      event.stopPropagation();
    };
    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', () => {
      if (!dragging || dragging.index !== index) return;
      dragging = null;
      dragBeats.delete(index);
    });
    rowEl.append(id, toggles, mix, canvas, time, actions);
    trackList.append(rowEl);
    tracks.push({ row: rowEl, arm, mute, solo, kind, clip, canvas, time, download, meterFill, rmsFill });
  }

  function beatFromClient(canvas: HTMLCanvasElement, clientX: number): number {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2) return viewOrigin;
    const frac = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(256, viewOrigin + frac * viewSpan));
  }

  function chooseTrack(index: number): void {
    targetTrack = index;
    library.setTarget(index);
    tracks.forEach((track, trackIndex) => track.row.classList.toggle('is-target', trackIndex === index));
    if (last) devices.render(last, index);
  }

  const masterMute = button('MUTE', 'btn small');
  masterMute.addEventListener('click', () => {
    if (!last) return;
    handlers.masterMute(!last.masterMute);
  });
  const masterFader = createFader({
    label: 'MASTER',
    ...RANGES.masterDb,
    value: DEFAULTS.masterDb,
    format: formatDb,
    title: 'Master level',
    onChange: handlers.masterDb,
  });
  const masterMeter = makeMeter('L / R', 2);
  const mix = button('MIX WAV', 'btn small');
  mix.addEventListener('click', handlers.downloadMix);
  const masterPanel = document.createElement('aside');
  masterPanel.className = 'panel master';
  const masterTitle = document.createElement('h2');
  masterTitle.textContent = 'Master';
  const masterMeters = document.createElement('div');
  masterMeters.className = 'strip';
  masterMeters.append(masterFader.root, masterMeter.root);
  masterPanel.append(masterTitle, masterMeters, masterMute, mix, note('Safety limiter sits after the master meter.'));

  const deck = document.createElement('section');
  deck.className = 'deck';
  deck.append(trackList, masterPanel);

  const rangeFrom = document.createElement('input');
  rangeFrom.type = 'range';
  rangeFrom.className = 'range-from';
  rangeFrom.min = '0';
  rangeFrom.max = '16';
  rangeFrom.step = '0.01';
  rangeFrom.value = '0';
  rangeFrom.setAttribute('aria-label', 'Play from');
  const rangeTo = document.createElement('input');
  rangeTo.type = 'range';
  rangeTo.className = 'range-to';
  rangeTo.min = '0';
  rangeTo.max = '16';
  rangeTo.step = '0.01';
  rangeTo.value = '16';
  rangeTo.setAttribute('aria-label', 'Play to');
  const rangeFromRead = document.createElement('span');
  rangeFromRead.className = 'range-read';
  const rangeToRead = document.createElement('span');
  rangeToRead.className = 'range-read';

  function paintRangeReadout(): void {
    const from = Number(rangeFrom.value);
    const to = Number(rangeTo.value);
    rangeFromRead.textContent = formatBeatPosition(from);
    rangeToRead.textContent = formatBeatPosition(to);
    rangeFrom.setAttribute('aria-valuetext', formatBeatPosition(from));
    rangeTo.setAttribute('aria-valuetext', formatBeatPosition(to));
  }

  function keepRangeGap(edited: HTMLInputElement): void {
    let from = Number(rangeFrom.value);
    let to = Number(rangeTo.value);
    if (to >= from + 0.25) return;
    if (edited === rangeFrom) from = Math.max(0, to - 0.25);
    else to = Math.min(Number(rangeTo.max), from + 0.25);
    rangeFrom.value = String(from);
    rangeTo.value = String(to);
  }

  const onRangeInput = (event: Event): void => {
    rangeEditing = true;
    const edited = event.currentTarget;
    if (edited instanceof HTMLInputElement) keepRangeGap(edited);
    paintRangeReadout();
  };
  const onRangeCommit = (event: Event): void => {
    rangeEditing = false;
    const edited = event.currentTarget;
    if (edited instanceof HTMLInputElement) keepRangeGap(edited);
    paintRangeReadout();
    handlers.playRange(Number(rangeFrom.value), Number(rangeTo.value));
  };
  for (const input of [rangeFrom, rangeTo]) {
    input.addEventListener('pointerdown', () => {
      rangeEditing = true;
    });
    input.addEventListener('input', onRangeInput);
    input.addEventListener('change', onRangeCommit);
  }
  paintRangeReadout();

  const loopRegion = button('Loop region', 'btn tiny');
  loopRegion.setAttribute('aria-pressed', 'false');
  loopRegion.title = 'Repeat playback between play from and play to';
  loopRegion.addEventListener('click', () => {
    if (!last) return;
    const next = !last.loopOn;
    if (next && !last.rangeCustom) {
      const end = Math.max(1, arrangeBeats);
      rangeFrom.value = '0';
      rangeTo.value = String(end);
      rangeFrom.max = String(end);
      rangeTo.max = String(end);
      paintRangeReadout();
      handlers.playRange(0, end, true);
      return;
    }
    handlers.loop(next);
  });
  const loopClip = button('Loop selection', 'btn tiny');
  loopClip.title = 'Loop the highlighted clip from its start through its end';
  loopClip.addEventListener('click', () => {
    const span = spans[targetTrack];
    handlers.loopSelection(span?.startBeat ?? 0, span?.lengthBeats ?? 0);
  });
  const rangeAll = button('All', 'btn tiny on');
  rangeAll.title = 'Play the whole arrangement, ignoring the range';
  rangeAll.setAttribute('aria-pressed', 'true');
  rangeAll.addEventListener('click', () => handlers.clearRange());

  const playRange = document.createElement('div');
  playRange.className = 'play-range';
  const rangeName = document.createElement('span');
  rangeName.className = 'mix-k';
  rangeName.textContent = 'Play';
  const dual = document.createElement('div');
  dual.className = 'dual-range';
  dual.title = 'Left handle is play from, right handle is play to. Drag the bar ruler to set the same span.';
  dual.append(rangeTo, rangeFrom);
  const markerRow = document.createElement('div');
  markerRow.className = 'markers';
  playRange.append(rangeName, rangeFromRead, dual, rangeToRead, loopRegion, loopClip, rangeAll);

  const arrangeHead = document.createElement('div');
  arrangeHead.className = 'zone-head';
  const arrangeTitle = document.createElement('h2');
  arrangeTitle.textContent = 'Arrangement';
  arrangeHead.append(arrangeTitle);
  const arrangeHint = document.createElement('p');
  arrangeHint.className = 'note';
  arrangeHint.textContent = 'Drag a clip to move it. Drag the edges to trim, or hold Alt and drag an edge for a fade. Shift snaps to 16ths. Markers jump the cue; Alt-click a marker to remove it.';

  const guide = document.createElement('ol');
  guide.className = 'guide';
  const guideSteps: Array<{ zone: ZoneName; text: string }> = [
    { zone: 'browse', text: 'Pick a sound' },
    { zone: 'arrange', text: 'Place it on a track' },
    { zone: 'arrange', text: 'Arm and record' },
    { zone: 'mix', text: 'Mix and bounce' },
  ];
  guideSteps.forEach((step, index) => {
    const item = document.createElement('li');
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'guide-step';
    jump.textContent = `${index + 1}. ${step.text}`;
    jump.addEventListener('click', () => setZone(step.zone));
    item.append(jump);
    guide.append(item);
  });
  const guideHide = document.createElement('button');
  guideHide.type = 'button';
  guideHide.className = 'btn tiny guide-hide';
  guideHide.textContent = 'Hide';
  const guideRow = document.createElement('div');
  guideRow.className = 'guide-row';
  guideRow.append(guide, guideHide);
  guideHide.addEventListener('click', () => {
    guideRow.hidden = true;
    try {
      localStorage.setItem('rs4-hide-guide', '1');
    } catch {
      // Ignore storage failures.
    }
  });
  try {
    guideRow.hidden = localStorage.getItem('rs4-hide-guide') === '1';
  } catch {
    guideRow.hidden = false;
  }

  const arrangeZone = document.createElement('section');
  arrangeZone.className = 'zone zone-session';
  attachCollapse(arrangeZone, arrangeHead, 'Arrangement');
  const devices = buildDevices({
    setInsert: handlers.setInsert,
    moveInsert: handlers.moveInsert,
    bypass: handlers.bypassInsert,
    param: handlers.insertParam,
    preset: handlers.insertPreset,
    send: handlers.trackSend,
    mono: handlers.trackMono,
    folder: handlers.trackFolder,
    muteFolder: handlers.muteFolder,
    copySlot: handlers.copySlot,
    clearSlot: handlers.clearSlot,
    launchSlot: handlers.launchSlot,
    launchScene: handlers.launchScene,
    back: handlers.backToArrangement,
    quant: handlers.launchQuant,
    auto: handlers.autoPoint,
    removeAuto: handlers.removeAuto,
    clearAuto: handlers.clearAuto,
    synth: handlers.synth,
  });
  const deviceHead = devices.element.querySelector('.zone-head');
  if (deviceHead instanceof HTMLElement) attachCollapse(devices.element, deviceHead, 'Devices');

  arrangeZone.append(arrangeHead, playRange, markerRow, arrangeHint, guideRow, deck);

  const mixHead = document.createElement('div');
  mixHead.className = 'zone-head';
  const mixTitle = document.createElement('h2');
  mixTitle.textContent = 'Console';
  mixHead.append(mixTitle);
  const mixHint = document.createElement('p');
  mixHint.className = 'note';
  mixHint.textContent = 'The insert chips show what is printed. Monitor starts off. Delay and reverb are cue sends and are not in the WAV.';
  const mixZone = document.createElement('section');
  mixZone.className = 'zone zone-console';
  attachCollapse(mixZone, mixHead, 'Console');
  mixZone.append(mixHead, mixHint, consoleRow);

  const browseZone = document.createElement('section');
  browseZone.className = 'zone zone-browse';
  browseZone.append(library.element);
  const browseHead = library.element.querySelector('.library-head');
  if (browseHead instanceof HTMLElement) attachCollapse(library.element, browseHead, 'Browser');

  const playZone = document.createElement('section');
  playZone.className = 'zone zone-play';
  playZone.append(library.play);
  const playHead = library.play.querySelector('.library-head');
  if (playHead instanceof HTMLElement) attachCollapse(library.play, playHead, 'Pads and keys');

  const deskStack = document.createElement('div');
  deskStack.className = 'desk-stack';
  deskStack.append(arrangeZone, devices.element, mixZone, playZone);
  const desk = document.createElement('div');
  desk.className = 'desk';
  desk.append(browseZone, deskStack);

  const footer = document.createElement('details');
  footer.className = 'footer';
  const footerSummary = document.createElement('summary');
  footerSummary.textContent = 'Shortcuts';
  const footerCopy = document.createElement('p');
  footerCopy.textContent =
    'Space plays or stops. R records. Z undoes, Shift+Z redoes. B taps tempo. L toggles the loop. M mutes the selected track. 1–8 selects a track. A–K plays the desk synth (Shift is softer). Drag a clip to move it, drag its edges to trim, Alt-drag an edge for a fade. MARK drops a locator. COUNT is a one-bar count-in. PUNCH records inside the play range. SAVE and LOAD keep the project in this browser. BOUNCE renders inserts and sends; STEMS downloads each track. Headphones if you raise the monitor.';
  footer.append(footerSummary, footerCopy);

  const zoneNav = document.createElement('nav');
  zoneNav.className = 'zone-nav';
  zoneNav.setAttribute('aria-label', 'Desk zones');
  const zoneButtons = new Map<ZoneName, HTMLButtonElement>();
  const zoneLabels: Array<[ZoneName, string]> = [
    ['arrange', 'Arrange'],
    ['mix', 'Mix'],
    ['browse', 'Sounds'],
    ['play', 'Play'],
  ];
  for (const [name, label] of zoneLabels) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'zone-tab';
    tab.textContent = label;
    tab.dataset.zone = name;
    tab.addEventListener('click', () => setZone(name));
    zoneNav.append(tab);
    zoneButtons.set(name, tab);
  }

  const dock = document.createElement('div');
  dock.className = 'dock';
  dock.append(transport, zoneNav);

  element.append(top, suspended, desk, status, footer, dock);
  setZone('arrange');

  function setZone(next: ZoneName): void {
    element.dataset.zone = next;
    for (const [name, tab] of zoneButtons) {
      const on = name === next;
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-pressed', String(on));
    }
  }

  let last: EngineSnapshot | null = null;
  let booting = false;
  let inSmooth = 0;
  let inHold = 0;
  let inClipUntil = 0;
  let lSmooth = 0;
  let rSmooth = 0;
  let lHold = 0;
  let rHold = 0;
  let masterClipUntil = 0;

  function setStatus(message: string): void {
    status.textContent = message;
  }

  function setMonitorWarning(on: boolean): void {
    monitorWarn.hidden = !on;
  }

  function render(snapshot: EngineSnapshot): void {
    last = snapshot;
    const locked = !snapshot.powered || booting;
    power.disabled = booting;
    power.classList.toggle('on', snapshot.powered);
    powerLed.classList.toggle('on', snapshot.powered);
    powerText.textContent = booting ? 'STARTING' : snapshot.powered ? 'ON' : 'POWER';
    sampleRate.textContent = snapshot.sampleRate ? `${(snapshot.sampleRate / 1000).toFixed(1)} kHz` : '— kHz';
    micPill.textContent = micText(snapshot.mic);
    micPill.classList.toggle('on', snapshot.mic === 'on');
    micPill.classList.toggle('bad', snapshot.mic === 'denied' || snapshot.mic === 'missing' || snapshot.mic === 'busy' || snapshot.mic === 'error');
    micButton.disabled = locked || snapshot.mic === 'pending';
    micButton.textContent = snapshot.mic === 'on' ? 'Release microphone' : snapshot.mic === 'pending' ? 'Requesting…' : 'Enable microphone';
    micButton.onclick = () => {
      if (snapshot.mic === 'on') handlers.releaseMic();
      else handlers.enableMic();
    };
    rec.disabled = locked || snapshot.mode === 'stopping' || snapshot.mode === 'recording';
    stop.disabled = locked || snapshot.mode === 'stopped';
    play.disabled = locked || snapshot.mode === 'stopping';
    reset.disabled = locked;
    element.classList.toggle('is-recording', snapshot.mode === 'recording');
    element.classList.toggle('is-playing', snapshot.mode === 'playing');
    press(inputMute, snapshot.inputMute);
    press(inputSolo, snapshot.inputSolo);
    press(masterMute, snapshot.masterMute);
    press(metro, snapshot.metroOn);
    press(loopRegion, snapshot.loopOn);
    press(loopTransport, snapshot.loopOn);
    press(rangeAll, !snapshot.loopOn && !snapshot.rangeCustom);
    const rangeBusy = rangeEditing || rulerActive || document.activeElement === rangeFrom || document.activeElement === rangeTo;
    if (!rangeBusy) {
      const shownFrom = snapshot.rangeCustom || snapshot.loopOn ? snapshot.playFromBeat : 0;
      const shownTo = snapshot.rangeCustom || snapshot.loopOn ? snapshot.playToBeat : arrangeBeats;
      const max = Math.max(arrangeBeats, shownTo, shownFrom + 0.25);
      rangeFrom.max = String(max);
      rangeTo.max = String(max);
      rangeFrom.value = String(shownFrom);
      rangeTo.value = String(Math.min(max, Math.max(shownFrom + 0.25, shownTo)));
      paintRangeReadout();
    }
    undo.disabled = locked || snapshot.mode === 'recording' || snapshot.mode === 'stopping' || !snapshot.canUndo;
    redo.disabled = locked || snapshot.mode === 'recording' || snapshot.mode === 'stopping' || !snapshot.canRedo;
    press(countIn, snapshot.countIn);
    press(punch, snapshot.punch);
    markerRow.replaceChildren();
    for (const marker of snapshot.markers) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'btn tiny marker';
      chip.textContent = `${marker.name} ${formatBeatPosition(marker.beat)}`;
      chip.title = 'Jump here. Alt-click removes the marker.';
      chip.addEventListener('click', (event) => {
        if (event.altKey) handlers.removeMarker(marker.id);
        else handlers.locate(marker.beat);
      });
      markerRow.append(chip);
    }
    devices.render(snapshot, targetTrack);
    gateBtn.disabled = locked || (snapshot.powered && !snapshot.gateAvailable);
    gateNote.hidden = !snapshot.powered || snapshot.gateAvailable;
    snapshot.tracks.forEach((track, index) => {
      const ui = tracks[index];
      if (!ui) return;
      press(ui.arm, track.armed);
      ui.arm.disabled = locked || snapshot.mode === 'recording' || snapshot.mode === 'stopping';
      press(ui.mute, track.muted);
      press(ui.solo, track.solo);
      ui.clip.textContent = track.name || (track.hasAudio ? 'clip' : 'empty');
      ui.kind.textContent = track.kind === 'instrument' ? 'INST' : 'AUD';
      ui.kind.classList.toggle('on', track.kind === 'instrument');
      ui.kind.disabled = locked || snapshot.mode === 'recording' || snapshot.mode === 'stopping';
      ui.download.disabled = !track.hasAudio;
    });
    mix.disabled = locked;
  }

  function setBooting(next: boolean): void {
    booting = next;
    if (last) render(last);
  }

  function paint(frame: PaintFrame): void {
    suspended.hidden = !frame.suspended;
    clock.textContent = formatTime(frame.position);
    clockLabel.textContent = frame.clockLabel;
    bars.textContent = formatBarBeat(frame.bar, frame.beat);
    element.classList.toggle('is-recording', frame.recording);
    element.classList.toggle('is-playing', frame.playing);

    inSmooth = inSmooth * 0.55 + frame.inputRms * 0.45;
    inHold = frame.inputPeak > inHold ? frame.inputPeak : inHold * 0.9;
    if (frame.inputPeak >= 0.98) inClipUntil = performance.now() + 1200;
    paintMeter(inputMeter, [inSmooth], [inHold], performance.now() < inClipUntil);

    lSmooth = lSmooth * 0.55 + frame.masterL * 0.45;
    rSmooth = rSmooth * 0.55 + frame.masterR * 0.45;
    lHold = frame.masterPeakL > lHold ? frame.masterPeakL : lHold * 0.9;
    rHold = frame.masterPeakR > rHold ? frame.masterPeakR : rHold * 0.9;
    if (frame.masterPeakL >= 0.98 || frame.masterPeakR >= 0.98) masterClipUntil = performance.now() + 1200;
    paintMeter(masterMeter, [lSmooth, rSmooth], [lHold, rHold], performance.now() < masterClipUntil);
    headLFill.style.height = `${meterPercent(lSmooth)}%`;
    headRFill.style.height = `${meterPercent(rSmooth)}%`;

    const reduction = Math.abs(frame.reduction);
    gr.fill.style.width = `${Math.min(100, (reduction / 24) * 100)}%`;
    gr.read.textContent = reduction < 0.05 ? '0' : reduction.toFixed(1);

    spans = frame.spans.map((span) => ({ startBeat: span.startBeat, lengthBeats: span.lengthBeats }));
    let endBeat = 16;
    for (const span of spans) endBeat = Math.max(endBeat, span.startBeat + span.lengthBeats);
    const showRange = loopPreview !== null || frame.looping || frame.rangeCustom;
    const loopStartBeat = loopPreview?.startBeat ?? (showRange ? frame.loopStartBeat : 0);
    const loopBeats = loopPreview
      ? Math.max(0, loopPreview.endBeat - loopPreview.startBeat)
      : showRange
        ? frame.loopBeats
        : 0;
    if (showRange) endBeat = Math.max(endBeat, loopStartBeat + loopBeats);
    arrangeBeats = Math.max(16, Math.ceil(endBeat / 4) * 4);
    const rangeBusy = rangeEditing || rulerActive || document.activeElement === rangeFrom || document.activeElement === rangeTo;
    if (!rangeBusy && !frame.rangeCustom && !frame.looping && loopPreview === null) {
      rangeFrom.max = String(arrangeBeats);
      rangeTo.max = String(arrangeBeats);
      if (rangeFrom.value !== '0') rangeFrom.value = '0';
      if (Number(rangeTo.value) !== arrangeBeats) rangeTo.value = String(arrangeBeats);
      paintRangeReadout();
    } else if (!rangeBusy) {
      const max = Math.max(arrangeBeats, loopStartBeat + loopBeats);
      rangeFrom.max = String(max);
      rangeTo.max = String(max);
    }
    const playhead = frame.playing || frame.recording ? (frame.position * frame.bpm) / 60 : -1;
    const strongRange = frame.looping || loopPreview !== null;
    viewSpan = Math.max(4, arrangeBeats / laneZoom);
    const focus = playhead >= 0 ? playhead : (last?.cueBeat ?? viewOrigin);
    if (focus < viewOrigin || focus > viewOrigin + viewSpan - 0.25) {
      viewOrigin = Math.max(0, Math.min(Math.max(0, arrangeBeats - viewSpan), focus - viewSpan * 0.2));
    }
    if (viewOrigin + viewSpan > arrangeBeats) viewOrigin = Math.max(0, arrangeBeats - viewSpan);
    const origin = viewOrigin;
    const markers = (last?.markers ?? []).map((marker) => ({ beat: marker.beat - origin, name: marker.name }));
    drawRuler(
      rulerCanvas,
      viewSpan,
      loopStartBeat - origin,
      loopBeats,
      playhead < 0 ? -1 : playhead - origin,
      strongRange,
      markers,
    );
    devices.paint({ reductions: frame.reductions, eq: frame.eq ? [...frame.eq] : null });
    tracks.forEach((track, index) => {
      const duration = frame.durations[index] ?? 0;
      const span = spans[index] ?? { startBeat: 0, lengthBeats: 0 };
      track.time.textContent = formatTime(duration);
      const level = frame.trackLevels[index] ?? 0;
      track.meterFill.style.height = `${meterPercent(level)}%`;
      track.rmsFill.style.height = `${meterPercent(frame.trackRms[index] ?? 0)}%`;
      track.canvas.classList.toggle('is-clip', span.lengthBeats > 0);
      const fades = last?.tracks[index];
      drawLane(
        track.canvas,
        frame.peaks[index] ?? [],
        (dragBeats.get(index) ?? span.startBeat) - origin,
        span.lengthBeats,
        viewSpan,
        loopStartBeat - origin,
        loopBeats,
        playhead < 0 ? -1 : playhead - origin,
        TRACK_COLORS[index] ?? '#e0a106',
        strongRange,
        fades?.fadeInBeats ?? 0,
        fades?.fadeOutBeats ?? 0,
        (fades?.volumeAuto ?? []).map((point) => ({ beat: point.beat - origin, value: point.value })),
      );
    });
  }

  return {
    element,
    setStatus,
    setBooting,
    setMonitorWarning,
    render,
    paint,
    setCatalog: library.setCatalog,
    catalogFailed: library.fail,
    setBpm: (value) => bpm.set(value),
    targetTrack: () => targetTrack,
    focusTrack: (index: number) => chooseTrack(index),
    quantizeOn: () => quantize.getAttribute('aria-pressed') === 'true',
  };
}

interface TrackRow {
  row: HTMLElement;
  arm: HTMLButtonElement;
  mute: HTMLButtonElement;
  solo: HTMLButtonElement;
  kind: HTMLButtonElement;
  clip: HTMLElement;
  canvas: HTMLCanvasElement;
  time: HTMLElement;
  download: HTMLButtonElement;
  meterFill: HTMLElement;
  rmsFill: HTMLElement;
}

interface MeterUi {
  root: HTMLElement;
  fills: HTMLElement[];
  holds: HTMLElement[];
  clip: HTMLElement;
  read: HTMLElement;
}

function knob(
  label: string,
  range: { min: number; max: number; step: number },
  value: number,
  format: (n: number) => string,
  onChange: (n: number) => void,
  title: string,
): Control {
  return createKnob({ label, min: range.min, max: range.max, step: range.step, value, format, onChange, title });
}

function button(text: string, className: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = text;
  return el;
}

function panel(title: string, ...children: Array<Node | null>): HTMLElement {
  const root = document.createElement('section');
  root.className = 'panel';
  const heading = document.createElement('h2');
  heading.textContent = title;
  root.append(heading);
  for (const child of children) if (child) root.append(child);
  return root;
}

function row(...children: Array<Node | null>): HTMLElement {
  const root = document.createElement('div');
  root.className = 'row';
  for (const child of children) if (child) root.append(child);
  return root;
}

function note(text: string): HTMLParagraphElement {
  const el = document.createElement('p');
  el.className = 'note';
  el.textContent = text;
  return el;
}

function label(text: string): HTMLElement {
  const el = document.createElement('p');
  el.className = 'group-label';
  el.textContent = text;
  return el;
}

function radio(name: string, value: string, text: string, checked: boolean): { root: HTMLLabelElement; input: HTMLInputElement } {
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;
  const root = document.createElement('label');
  root.className = 'choice';
  root.append(input, document.createTextNode(text));
  return { root, input };
}

function checkbox(text: string, checked: boolean): { root: HTMLLabelElement; input: HTMLInputElement } {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  const root = document.createElement('label');
  root.className = 'choice';
  root.append(input, document.createTextNode(text));
  return { root, input };
}

function select(options: Array<[string, string]>, value: string, aria: string): HTMLSelectElement {
  const el = document.createElement('select');
  el.setAttribute('aria-label', aria);
  for (const [optionValue, text] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = text;
    option.selected = optionValue === value;
    el.append(option);
  }
  return el;
}

function press(el: HTMLButtonElement, on: boolean): void {
  el.classList.toggle('on', on);
  el.setAttribute('aria-pressed', String(on));
}

function micText(state: MicState): string {
  switch (state) {
    case 'on':
      return 'MIC ON';
    case 'pending':
      return 'MIC …';
    case 'denied':
      return 'MIC DENIED';
    case 'missing':
      return 'NO MIC';
    case 'busy':
      return 'MIC BUSY';
    case 'error':
      return 'MIC ERROR';
    default:
      return 'MIC OFF';
  }
}

function makeMeter(caption: string, bars: number): MeterUi {
  const root = document.createElement('div');
  root.className = 'meter-stack';
  const clip = document.createElement('div');
  clip.className = 'clip';
  const barsEl = document.createElement('div');
  barsEl.className = 'meter';
  const fills: HTMLElement[] = [];
  const holds: HTMLElement[] = [];
  for (let i = 0; i < bars; i++) {
    const bar = document.createElement('div');
    bar.className = 'meter-bar';
    const fill = document.createElement('div');
    fill.className = 'meter-fill';
    const hold = document.createElement('div');
    hold.className = 'meter-hold';
    bar.append(fill, hold);
    barsEl.append(bar);
    fills.push(fill);
    holds.push(hold);
  }
  const read = document.createElement('span');
  read.className = 'meter-read';
  read.textContent = '-inf';
  const cap = document.createElement('span');
  cap.className = 'meter-caption';
  cap.textContent = caption;
  root.append(clip, barsEl, read, cap);
  return { root, fills, holds, clip, read };
}

function paintMeter(meter: MeterUi, levels: number[], holds: number[], clip: boolean): void {
  levels.forEach((level, index) => {
    const fill = meter.fills[index];
    const hold = meter.holds[index];
    if (!fill || !hold) return;
    fill.style.height = `${meterPercent(level)}%`;
    hold.style.bottom = `${meterPercent(holds[index] ?? 0)}%`;
  });
  const loudest = levels.reduce((max, value) => Math.max(max, value), 0);
  meter.read.textContent = formatMeterDb(loudest);
  meter.clip.classList.toggle('on', clip);
}

function makeGr(): { root: HTMLElement; fill: HTMLElement; read: HTMLElement } {
  const root = document.createElement('div');
  root.className = 'gr';
  const name = document.createElement('span');
  name.textContent = 'GR';
  const track = document.createElement('div');
  track.className = 'gr-track';
  const fill = document.createElement('div');
  fill.className = 'gr-fill';
  track.append(fill);
  const read = document.createElement('span');
  read.className = 'gr-read';
  read.textContent = '0';
  root.append(name, track, read);
  return { root, fill, read };
}

function resizeCanvas(canvas: HTMLCanvasElement): { width: number; height: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(rect.width * dpr);
  const height = Math.floor(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height };
}

function drawRuler(
  canvas: HTMLCanvasElement,
  viewBeats: number,
  loopStart: number,
  loopBeats: number,
  playhead: number,
  strong = false,
  markers: readonly { beat: number; name: string }[] = [],
): void {
  const size = resizeCanvas(canvas);
  const ctx = canvas.getContext('2d');
  if (!size || !ctx) return;
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = '#10141a';
  ctx.fillRect(0, 0, size.width, size.height);
  if (loopBeats > 0) {
    const x = (loopStart / viewBeats) * size.width;
    const w = (loopBeats / viewBeats) * size.width;
    ctx.fillStyle = strong ? 'rgba(224, 161, 6, 0.38)' : 'rgba(224, 161, 6, 0.2)';
    ctx.fillRect(x, 0, w, size.height);
  }
  ctx.font = `${Math.max(10, Math.floor(size.height * 0.42))}px ui-monospace, monospace`;
  ctx.textBaseline = 'middle';
  const bars = Math.ceil(viewBeats / 4);
  for (let bar = 0; bar <= bars; bar++) {
    const x = ((bar * 4) / viewBeats) * size.width;
    ctx.fillStyle = 'rgba(244, 247, 251, 0.35)';
    ctx.fillRect(x, 0, 1, size.height);
    if (x < size.width - 16) {
      ctx.fillStyle = '#c5ced8';
      ctx.fillText(String(bar + 1), x + 4, size.height / 2);
    }
  }
  ctx.fillStyle = '#8ecae6';
  for (const marker of markers) {
    const x = (marker.beat / viewBeats) * size.width;
    ctx.fillRect(x, 0, 2, size.height);
  }
  paintPlayhead(ctx, size.width, size.height, playhead, viewBeats);
}

function drawLane(
  canvas: HTMLCanvasElement,
  peaks: readonly number[],
  startBeat: number,
  lengthBeats: number,
  viewBeats: number,
  loopStart: number,
  loopBeats: number,
  playhead: number,
  color: string,
  strong = false,
  fadeInBeats = 0,
  fadeOutBeats = 0,
  volume: readonly { beat: number; value: number }[] = [],
): void {
  const size = resizeCanvas(canvas);
  const ctx = canvas.getContext('2d');
  if (!size || !ctx) return;
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = '#0c0f14';
  ctx.fillRect(0, 0, size.width, size.height);
  if (loopBeats > 0) {
    const x = (loopStart / viewBeats) * size.width;
    const w = (loopBeats / viewBeats) * size.width;
    ctx.fillStyle = strong ? 'rgba(224, 161, 6, 0.2)' : 'rgba(224, 161, 6, 0.1)';
    ctx.fillRect(x, 0, w, size.height);
  }
  const beats = Math.ceil(viewBeats);
  for (let beat = 0; beat <= beats; beat++) {
    const x = (beat / viewBeats) * size.width;
    ctx.fillStyle = beat % 4 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, 0, 1, size.height);
  }
  if (lengthBeats > 0 && peaks.length > 0) {
    const x0 = (startBeat / viewBeats) * size.width;
    const clipWidth = Math.max(2, (lengthBeats / viewBeats) * size.width);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(x0, 2, clipWidth, size.height - 4);
    ctx.fillStyle = color;
    const columns = Math.max(1, Math.floor(clipWidth));
    for (let x = 0; x < columns; x++) {
      const start = Math.floor((x / columns) * peaks.length);
      const end = Math.min(peaks.length, Math.max(start + 1, Math.floor(((x + 1) / columns) * peaks.length)));
      let peak = 0;
      for (let i = start; i < end; i++) {
        const value = peaks[i] ?? 0;
        if (value > peak) peak = value;
      }
      const h = Math.max(1, Math.min(1, peak) * (size.height - 8));
      ctx.fillRect(x0 + x, (size.height - h) / 2, 1, h);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    if (fadeInBeats > 0) {
      ctx.beginPath();
      ctx.moveTo(x0, 2);
      ctx.lineTo(x0 + (fadeInBeats / viewBeats) * size.width, size.height - 2);
      ctx.lineTo(x0, size.height - 2);
      ctx.fill();
    }
    if (fadeOutBeats > 0) {
      const fadeX = x0 + ((lengthBeats - fadeOutBeats) / viewBeats) * size.width;
      const endX = x0 + clipWidth;
      ctx.beginPath();
      ctx.moveTo(fadeX, size.height - 2);
      ctx.lineTo(endX, 2);
      ctx.lineTo(endX, size.height - 2);
      ctx.fill();
    }
  }
  if (volume.length > 1) {
    ctx.strokeStyle = 'rgba(240, 162, 2, 0.9)';
    ctx.beginPath();
    volume.forEach((point, index) => {
      const x = (point.beat / viewBeats) * size.width;
      const y = size.height - ((point.value + 60) / 66) * (size.height - 4) - 2;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  paintPlayhead(ctx, size.width, size.height, playhead, viewBeats);
}

function paintPlayhead(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  playhead: number,
  viewBeats: number,
): void {
  if (playhead < 0 || viewBeats <= 0) return;
  const x = Math.min(width - 1, Math.max(0, (playhead / viewBeats) * width));
  ctx.fillStyle = '#f4f7fb';
  ctx.fillRect(x, 0, Math.max(1, width / 500), height);
}

function snapBeat(beat: number, fine: boolean): number {
  const grid = fine ? 0.25 : 1;
  const steps = Math.round(beat / grid);
  return Math.max(0, Math.min(256, steps * grid));
}

function rangeFromDrag(anchor: number, current: number, fine: boolean): { startBeat: number; endBeat: number } {
  const startBeat = snapBeat(Math.min(anchor, current), fine);
  let endBeat = snapBeat(Math.max(anchor, current), fine);
  if (endBeat < startBeat + 1) endBeat = startBeat + 1;
  return { startBeat, endBeat: Math.min(256, endBeat) };
}

function attachCollapse(host: HTMLElement, head: HTMLElement, label: string): void {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn tiny zone-toggle';
  toggle.textContent = 'Hide';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-label', `Collapse ${label}`);
  toggle.addEventListener('click', () => {
    const collapsed = host.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.textContent = collapsed ? 'Show' : 'Hide';
    toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${label}`);
  });
  head.append(toggle);
}

function insertChip(label: string, active: boolean): HTMLElement {
  const chip = document.createElement('span');
  chip.className = active ? 'insert on' : 'insert';
  chip.textContent = label;
  return chip;
}
