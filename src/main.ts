import './style.css';
import { StudioEngine } from './audio/engine';
import { SampleBank, type SampleMeta } from './audio/library';
import type { ConsoleView } from './ui/view';
import { buildView } from './ui/view';

const api: { engine?: StudioEngine; view?: ConsoleView } = {};
const bank = new SampleBank();

api.engine = new StudioEngine({
  onStatus: (message) => api.view?.setStatus(message),
  onChange: () => {
    if (api.engine && api.view) api.view.render(api.engine.snapshot());
  },
});

api.view = buildView({
  power: () => {
    const engine = api.engine;
    const view = api.view;
    if (!engine || !view) return;
    view.setBooting(true);
    view.setStatus('Starting audio…');
    void engine.powerOn().finally(() => view.setBooting(false));
  },
  record: () => api.engine?.record(),
  stop: () => api.engine?.stop(),
  play: () => api.engine?.play(),
  reset: () => api.engine?.reset(),
  enableMic: () => void api.engine?.enableMic(),
  releaseMic: () => api.engine?.releaseMic(),
  inputMode: (mode) => api.engine?.setInputMode(mode),
  voiceProcessing: (on) => api.engine?.setVoiceProcessing(on),
  toneShape: (shape) => api.engine?.setToneShape(shape),
  toneHz: (hz) => api.engine?.setToneFrequency(hz),
  toneDb: (db) => api.engine?.setToneLevel(db),
  monitorDb: (db) => api.engine?.setMonitorDb(db),
  preampDb: (db) => api.engine?.setPreampDb(db),
  hpf: (hz) => api.engine?.setHpf(hz),
  polarity: (inverted) => api.engine?.setPolarity(inverted),
  pan: (value) => api.engine?.setPan(value),
  channelDb: (db) => api.engine?.setChannelDb(db),
  inputMute: (muted) => api.engine?.setInputMute(muted),
  inputSolo: (solo) => api.engine?.setInputSolo(solo),
  lowHz: (hz) => api.engine?.setLowHz(hz),
  lowGain: (db) => api.engine?.setLowGain(db),
  midHz: (hz) => api.engine?.setMidHz(hz),
  midGain: (db) => api.engine?.setMidGain(db),
  midQ: (q) => api.engine?.setMidQ(q),
  highHz: (hz) => api.engine?.setHighHz(hz),
  highGain: (db) => api.engine?.setHighGain(db),
  gate: (on) => api.engine?.setGateEnabled(on),
  gateThreshold: (db) => api.engine?.setGateThreshold(db),
  gateAttack: (seconds) => api.engine?.setGateAttack(seconds),
  gateRelease: (seconds) => api.engine?.setGateRelease(seconds),
  compThreshold: (db) => api.engine?.setCompThreshold(db),
  compRatio: (ratio) => api.engine?.setCompRatio(ratio),
  compAttack: (seconds) => api.engine?.setCompAttack(seconds),
  compRelease: (seconds) => api.engine?.setCompRelease(seconds),
  compKnee: (db) => api.engine?.setCompKnee(db),
  makeup: (db) => api.engine?.setMakeup(db),
  delayTime: (seconds) => api.engine?.setDelayTime(seconds),
  delayFeedback: (amount) => api.engine?.setDelayFeedback(amount),
  delayDamp: (hz) => api.engine?.setDelayDamp(hz),
  delaySend: (amount) => api.engine?.setDelaySend(amount),
  reverbDecay: (seconds) => api.engine?.setReverbDecay(seconds),
  reverbSend: (amount) => api.engine?.setReverbSend(amount),
  masterDb: (db) => api.engine?.setMasterDb(db),
  masterMute: (muted) => api.engine?.setMasterMute(muted),
  metro: (on) => api.engine?.setMetronome(on),
  metroBpm: (bpm) => api.engine?.setMetroBpm(bpm),
  metroLevel: (level) => api.engine?.setMetroLevel(level),
  trackArmed: (index, armed) => api.engine?.setTrackArmed(index, armed),
  trackMuted: (index, muted) => api.engine?.setTrackMuted(index, muted),
  trackSolo: (index, solo) => api.engine?.setTrackSolo(index, solo),
  trackDb: (index, db) => api.engine?.setTrackDb(index, db),
  trackPan: (index, pan) => api.engine?.setTrackPan(index, pan),
  trackKind: (index, kind) => api.engine?.setTrackKind(index, kind),
  trackStart: (index, beat) => api.engine?.setTrackStartBeat(index, beat),
  trackImport: (index, file, beat) => {
    void file.arrayBuffer().then((data) => api.engine?.importEncoded(index, data, file.name, beat));
  },
  trackDropSample: (index, sampleId, beat) => {
    void placeSample(sampleId, index, beat);
  },
  downloadTrack: (index) => {
    const blob = api.engine?.trackWav(index);
    if (!blob) {
      api.view?.setStatus('That track is empty.');
      return;
    }
    saveBlob(blob, `rs4-track-${index + 1}.wav`);
    api.view?.setStatus(`Downloaded track ${index + 1}. Inserts are printed; delay and reverb are not.`);
  },
  downloadMix: () => {
    const mix = api.engine?.mixWav();
    if (!mix) {
      api.view?.setStatus('Nothing to mix. Unmute a recorded track or clear solo.');
      return;
    }
    saveBlob(mix.blob, 'rs4-mixdown.wav');
    if (mix.silent) api.view?.setStatus('Mixdown downloaded, but it looks silent.');
    else if (mix.scaled) api.view?.setStatus('Mixdown downloaded and scaled so the sum does not clip.');
    else api.view?.setStatus('Mixdown downloaded. It uses track levels, pan, mute, solo, and the master fader.');
  },
  undo: () => api.engine?.undo(),
  loop: (on) => api.engine?.setLoop(on),
  loopStart: (bar) => api.engine?.setLoopStartBar(bar),
  loopBars: (bars) => api.engine?.setLoopBars(bars),
  loopRegion: (startBar, bars) => api.engine?.setLoopRegion(startBar, bars),
  previewSample: (id) => {
    void withSample(id, (_meta, buffer) => api.engine?.previewBuffer(buffer));
  },
  loadSample: (id) => {
    const index = api.view?.targetTrack() ?? 0;
    void placeSample(id, index, 0);
  },
  triggerSample: (id) => {
    void withSample(id, (_meta, buffer) => api.engine?.triggerBuffer(buffer, api.view?.quantizeOn() ?? true));
  },
  noteOn: (midi) => api.engine?.noteOn(midi),
  noteOff: (midi) => api.engine?.noteOff(midi),
});

const view = api.view;
const engine = api.engine;
const root = document.querySelector('#app');
if (!root) throw new Error('Missing #app');
root.replaceChildren(view.element);
view.setStatus(
  'Press Power. Sounds are in the browser — preview, then Place or drag onto a lane. Audio 1–4 print the channel; Inst 5–8 print pads and keys. On a phone, use Arrange, Mix, Sounds, and Play. MONITOR starts off so a mic cannot feed back.',
);
void bank
  .load()
  .then(() => view.setCatalog(bank.metas))
  .catch(() => view.catalogFailed('The sample library did not load. Recording and the tone generator still work.'));
view.render(engine.snapshot());

function loop(): void {
  engine.poll();
  const clock = engine.clock();
  view.paint({
    ...engine.levels(),
    position: clock.seconds,
    clockLabel: clock.label,
    bar: clock.bar,
    beat: clock.beat,
    sessionLength: engine.sessionLength(),
    durations: engine.durations(),
    peaks: engine.peaks(),
    trackLevels: engine.trackMeters(),
    bpm: engine.bpm(),
    spans: engine.clipSpans(),
    loopStartBeat: engine.loopStartBeat(),
    loopBeats: engine.loopLengthBeats(),
    looping: engine.isLooping(),
    recording: engine.modeName() === 'recording',
    playing: engine.modeName() === 'playing',
    suspended: engine.contextState() === 'suspended',
  });
  window.requestAnimationFrame(loop);
}
window.requestAnimationFrame(loop);

window.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement) {
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    const mode = engine.modeName();
    if (mode === 'playing' || mode === 'recording') engine.stop();
    else engine.play();
  } else if (event.code === 'KeyR' && !event.repeat) {
    event.preventDefault();
    engine.record();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') engine.resume();
});

async function withSample(id: string, use: (meta: SampleMeta, buffer: AudioBuffer) => void): Promise<void> {
  const engine = api.engine;
  const view = api.view;
  if (!engine || !view) return;
  const meta = bank.meta(id);
  if (!meta) {
    view.setStatus('That sample is not in the library.');
    return;
  }
  await engine.powerOn();
  const ctx = engine.audioContext();
  if (!ctx) return;
  try {
    const buffer = await bank.buffer(ctx, meta);
    use(meta, buffer);
  } catch {
    view.setStatus(`Could not decode ${meta.name}.`);
  }
}

async function placeSample(id: string, index: number, startBeat = 0): Promise<void> {
  await withSample(id, (meta, buffer) => {
    const engine = api.engine;
    const view = api.view;
    if (!engine || !view) return;
    const tempo = meta.kind === 'loop' ? meta.bpm : null;
    if (tempo) view.setBpm(tempo);
    engine.loadClip(index, buffer, { name: meta.name, bpm: tempo, startBeat });
  });
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
