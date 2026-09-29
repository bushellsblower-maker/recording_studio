import { DEFAULTS, RANGES } from '../defaults';
import { formatBpm, formatDb, formatHz, formatMeterDb, formatMs, formatPan, formatPercent, formatQ, formatRatio, formatTime, meterPercent } from '../audio/units';
import type { EngineSnapshot, InputMode, Levels, MicState, ToneShape } from '../types';
import { TRACK_COUNT } from '../types';
import { createFader, createKnob, type Control } from './controls';

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
  downloadTrack: (index: number) => void;
  downloadMix: () => void;
}

export interface PaintFrame extends Levels {
  position: number;
  clockLabel: 'POS' | 'LEN';
  sessionLength: number;
  durations: readonly number[];
  peaks: readonly (readonly number[])[];
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
}

const TRACK_COLORS = ['#e15a3a', '#e0a106', '#3cb7a0', '#6c8cff'];

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

  const top = document.createElement('header');
  top.className = 'topbar';
  const brand = document.createElement('div');
  brand.className = 'brand';
  const title = document.createElement('h1');
  title.textContent = 'RS-4';
  const sub = document.createElement('p');
  sub.textContent = 'Recording console';
  brand.append(title, sub);
  const pills = document.createElement('div');
  pills.className = 'pills';
  pills.append(micPill, sampleRate);
  const clockWrap = document.createElement('div');
  clockWrap.className = 'clock-wrap';
  clockWrap.append(clockLabel, clock);
  top.append(brand, pills, clockWrap, power);

  const rec = button('REC', 'btn rec');
  const stop = button('STOP', 'btn stop');
  const play = button('PLAY', 'btn play');
  const reset = button('RESET', 'btn reset');
  rec.addEventListener('click', handlers.record);
  stop.addEventListener('click', handlers.stop);
  play.addEventListener('click', handlers.play);
  reset.addEventListener('click', handlers.reset);

  const metro = button('METRO', 'btn small');
  metro.setAttribute('aria-pressed', 'false');
  metro.addEventListener('click', () => {
    if (!last) return;
    handlers.metro(!last.metroOn);
  });
  const bpm = knob('BPM', RANGES.metroBpm, DEFAULTS.metroBpm, formatBpm, handlers.metroBpm, 'Metronome tempo');
  const metroLevel = knob('CLICK', RANGES.metroLevel, DEFAULTS.metroLevel, formatPercent, handlers.metroLevel, 'Metronome level');

  const transport = document.createElement('section');
  transport.className = 'transport panel';
  const transportButtons = document.createElement('div');
  transportButtons.className = 'transport-buttons';
  transportButtons.append(rec, stop, play, reset);
  const metroBox = document.createElement('div');
  metroBox.className = 'metro';
  metroBox.append(metro, bpm.root, metroLevel.root);
  transport.append(transportButtons, metroBox);

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
  const channelPanel = panel(
    'Channel',
    row(preamp.root, hpf.root, pan.root),
    row(polarity, inputMute, inputSolo),
    channelMeters,
    note('Inserts, fader, and pan are printed. Monitor does not change the take.'),
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
  const delaySend = knob('SEND', RANGES.delaySend, DEFAULTS.delaySend, formatPercent, handlers.delaySend, 'Delay send');
  const reverbDecay = knob('DECAY', RANGES.reverbDecay, DEFAULTS.reverbDecay, (value) => `${value.toFixed(2)} s`, handlers.reverbDecay, 'Reverb decay');
  const reverbSend = knob('SEND', RANGES.reverbSend, DEFAULTS.reverbSend, formatPercent, handlers.reverbSend, 'Reverb send');
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

  const tracks: TrackRow[] = [];
  const trackList = document.createElement('div');
  trackList.className = 'tracks';
  for (let index = 0; index < TRACK_COUNT; index++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'track';
    rowEl.style.setProperty('--track', TRACK_COLORS[index] ?? '#e0a106');
    const name = document.createElement('span');
    name.className = 'track-name';
    name.textContent = `TRK ${index + 1}`;
    const arm = button('ARM', 'btn tiny arm');
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
    const toggles = document.createElement('div');
    toggles.className = 'track-toggles';
    toggles.append(arm, mute, solo);
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
    const levelWrap = document.createElement('label');
    levelWrap.className = 'track-level';
    levelWrap.append(level, levelRead);
    const canvas = document.createElement('canvas');
    canvas.className = 'wave';
    canvas.setAttribute('aria-hidden', 'true');
    const time = document.createElement('span');
    time.className = 'track-time';
    time.textContent = '00:00.0';
    const download = button('WAV', 'btn tiny');
    download.setAttribute('aria-label', `Download track ${index + 1} WAV`);
    download.addEventListener('click', () => handlers.downloadTrack(index));
    rowEl.append(name, toggles, levelWrap, canvas, time, download);
    trackList.append(rowEl);
    tracks.push({ arm, mute, solo, canvas, time, download });
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

  const footer = document.createElement('footer');
  footer.className = 'footer';
  footer.textContent = 'Space plays or stops. R records. Shift-drag a knob for fine moves. Double-click a control to reset it. Headphones if you raise the monitor.';

  element.append(top, suspended, transport, consoleRow, deck, status, footer);

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
    gateBtn.disabled = locked || (snapshot.powered && !snapshot.gateAvailable);
    gateNote.hidden = !snapshot.powered || snapshot.gateAvailable;
    snapshot.tracks.forEach((track, index) => {
      const ui = tracks[index];
      if (!ui) return;
      press(ui.arm, track.armed);
      ui.arm.disabled = locked || snapshot.mode === 'recording' || snapshot.mode === 'stopping';
      press(ui.mute, track.muted);
      press(ui.solo, track.solo);
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

    const reduction = Math.abs(frame.reduction);
    gr.fill.style.width = `${Math.min(100, (reduction / 24) * 100)}%`;
    gr.read.textContent = reduction < 0.05 ? '0' : reduction.toFixed(1);

    const scale = Math.max(frame.sessionLength, frame.position, 0.001);
    tracks.forEach((track, index) => {
      const duration = frame.durations[index] ?? 0;
      track.time.textContent = formatTime(duration);
      drawWave(
        track.canvas,
        frame.peaks[index] ?? [],
        duration,
        frame.playing || frame.recording ? frame.position : -1,
        scale,
        TRACK_COLORS[index] ?? '#e0a106',
      );
    });
  }

  return { element, setStatus, setBooting, setMonitorWarning, render, paint };
}

interface TrackRow {
  arm: HTMLButtonElement;
  mute: HTMLButtonElement;
  solo: HTMLButtonElement;
  canvas: HTMLCanvasElement;
  time: HTMLElement;
  download: HTMLButtonElement;
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

function drawWave(
  canvas: HTMLCanvasElement,
  peaks: readonly number[],
  duration: number,
  position: number,
  scale: number,
  color: string,
): void {
  const size = resizeCanvas(canvas);
  const ctx = canvas.getContext('2d');
  if (!size || !ctx) return;
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = '#0c0f14';
  ctx.fillRect(0, 0, size.width, size.height);
  if (duration <= 0 || peaks.length === 0) {
    ctx.fillStyle = '#667484';
    ctx.font = `${Math.max(11, Math.floor(size.height * 0.28))}px sans-serif`;
    ctx.fillText('empty', 10, Math.floor(size.height * 0.62));
    return;
  }
  const widthFrac = scale > 0 ? Math.min(1, duration / scale) : 1;
  const columns = Math.max(1, Math.floor(size.width * widthFrac));
  ctx.fillStyle = color;
  for (let x = 0; x < columns; x++) {
    const start = Math.floor((x / columns) * peaks.length);
    const end = Math.min(peaks.length, Math.max(start + 1, Math.floor(((x + 1) / columns) * peaks.length)));
    let peak = 0;
    for (let i = start; i < end; i++) {
      const value = peaks[i] ?? 0;
      if (value > peak) peak = value;
    }
    const h = Math.max(1, Math.min(1, peak) * (size.height - 4));
    ctx.fillRect(x, (size.height - h) / 2, 1, h);
  }
  if (position >= 0 && scale > 0) {
    const x = Math.min(size.width - 1, Math.max(0, (position / scale) * size.width));
    ctx.fillStyle = '#f4f7fb';
    ctx.fillRect(x, 0, Math.max(1, size.width / 400), size.height);
  }
}
