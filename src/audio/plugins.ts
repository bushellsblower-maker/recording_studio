import { readReduction } from './meters';
import { clamp, formatDb, formatHz, formatMs, formatPercent, formatQ, formatRatio } from './units';

export const INSERT_COUNT = 3;
export const SCENE_COUNT = 4;

export const PLUGIN_KINDS = ['eq', 'comp', 'tape', 'chorus', 'phaser', 'utility', 'limiter'] as const;
export type PluginKind = (typeof PLUGIN_KINDS)[number];

export type PluginUnit = 'db' | 'hz' | 'q' | 'ratio' | 'ms' | 'percent' | 'plain';

export interface PluginSpec {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: PluginUnit;
}

export interface PluginPreset {
  name: string;
  values: Record<string, number>;
}

export interface PluginInfo {
  kind: PluginKind;
  name: string;
  blurb: string;
  params: PluginSpec[];
  /** AudioParam (or gain) that arrangement automation rides. */
  autoParam: string;
  presets: PluginPreset[];
}

export interface LivePlugin {
  kind: PluginKind;
  input: AudioNode;
  output: AudioNode;
  bypassed: boolean;
  values: Record<string, number>;
  set(id: string, value: number): void;
  setBypass(on: boolean): void;
  param(id: string): AudioParam | null;
  reduction(): number;
  curve(bins: number): Float32Array | null;
  dispose(): void;
}

export function isPluginKind(value: string): value is PluginKind {
  return (PLUGIN_KINDS as readonly string[]).includes(value);
}

export function pluginInfo(kind: PluginKind): PluginInfo {
  return CATALOG[kind];
}

export function formatPluginValue(spec: PluginSpec, value: number): string {
  if (spec.unit === 'db') return formatDb(value);
  if (spec.unit === 'hz') return formatHz(value);
  if (spec.unit === 'q') return formatQ(value);
  if (spec.unit === 'ratio') return formatRatio(value);
  if (spec.unit === 'ms') return formatMs(value);
  if (spec.unit === 'percent') return formatPercent(value);
  return value.toFixed(2);
}

export function defaultParams(kind: PluginKind): Record<string, number> {
  const values: Record<string, number> = {};
  for (const spec of pluginInfo(kind).params) values[spec.id] = spec.defaultValue;
  return values;
}

export function clampParams(kind: PluginKind, incoming: Record<string, number>): Record<string, number> {
  const values = defaultParams(kind);
  for (const spec of pluginInfo(kind).params) {
    const raw = incoming[spec.id];
    if (typeof raw === 'number' && Number.isFinite(raw)) values[spec.id] = clamp(raw, spec.min, spec.max);
  }
  return values;
}

/** input -> inserts -> destination. Empty slots are skipped. */
export function wireInserts(source: AudioNode, inserts: readonly (LivePlugin | null)[], destination: AudioNode): void {
  safeDisconnect(source);
  for (const plug of inserts) {
    if (!plug) continue;
    safeDisconnect(plug.output);
  }
  let cursor = source;
  for (const plug of inserts) {
    if (!plug) continue;
    cursor.connect(plug.input);
    cursor = plug.output;
  }
  cursor.connect(destination);
}

export function createPlugin(ctx: BaseAudioContext, kind: PluginKind): LivePlugin {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const bypassDry = ctx.createGain();
  const effectSend = ctx.createGain();
  input.connect(bypassDry);
  bypassDry.connect(output);
  input.connect(effectSend);

  const audio = new Map<string, AudioParam>();
  const setters = new Map<string, (value: number) => void>();
  let reductionNode: DynamicsCompressorNode | null = null;
  let curveFilters: BiquadFilterNode[] | null = null;
  const oscs: OscillatorNode[] = [];

  const effectOut = ctx.createGain();
  effectOut.connect(output);
  effectSend.connect(effectOut);

  if (kind === 'eq') {
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    effectSend.disconnect(effectOut);
    effectSend.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(effectOut);
    audio.set('lowHz', low.frequency);
    audio.set('lowGain', low.gain);
    audio.set('midHz', mid.frequency);
    audio.set('midGain', mid.gain);
    audio.set('midQ', mid.Q);
    audio.set('highHz', high.frequency);
    audio.set('highGain', high.gain);
    curveFilters = [low, mid, high];
  } else if (kind === 'comp' || kind === 'limiter') {
    const comp = ctx.createDynamicsCompressor();
    const makeup = ctx.createGain();
    effectSend.disconnect(effectOut);
    effectSend.connect(comp);
    comp.connect(makeup);
    makeup.connect(effectOut);
    reductionNode = comp;
    if (kind === 'comp') {
      audio.set('threshold', comp.threshold);
      audio.set('ratio', comp.ratio);
      audio.set('attack', comp.attack);
      audio.set('release', comp.release);
      audio.set('knee', comp.knee);
      audio.set('makeup', makeup.gain);
      setters.set('makeup', (value) => {
        makeup.gain.value = dbToAmp(value);
      });
    } else {
      comp.ratio.value = 20;
      comp.knee.value = 0;
      comp.attack.value = 0.002;
      audio.set('ceiling', comp.threshold);
      audio.set('release', comp.release);
    }
  } else if (kind === 'tape') {
    const shaper = ctx.createWaveShaper();
    shaper.oversample = '2x';
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    const wet = ctx.createGain();
    const dry = ctx.createGain();
    effectSend.disconnect(effectOut);
    effectSend.connect(shaper);
    shaper.connect(tone);
    tone.connect(wet);
    wet.connect(effectOut);
    effectSend.connect(dry);
    dry.connect(effectOut);
    audio.set('tone', tone.frequency);
    audio.set('mix', wet.gain);
    setters.set('drive', (value) => {
      shaper.curve = tapeCurve(value);
    });
    setters.set('mix', (value) => {
      wet.gain.value = value;
      dry.gain.value = 1 - value;
    });
  } else if (kind === 'chorus' || kind === 'phaser') {
    const wet = ctx.createGain();
    const dry = ctx.createGain();
    effectSend.disconnect(effectOut);
    effectSend.connect(dry);
    dry.connect(effectOut);
    wet.connect(effectOut);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    const depth = ctx.createGain();
    lfo.connect(depth);
    oscs.push(lfo);
    if (kind === 'chorus') {
      const delay = ctx.createDelay(0.08);
      delay.delayTime.value = 0.016;
      const voice2 = ctx.createDelay(0.08);
      voice2.delayTime.value = 0.023;
      effectSend.connect(delay);
      effectSend.connect(voice2);
      delay.connect(wet);
      voice2.connect(wet);
      depth.connect(delay.delayTime);
      const depth2 = ctx.createGain();
      depth.connect(depth2);
      depth2.gain.value = -1;
      depth2.connect(voice2.delayTime);
      audio.set('rate', lfo.frequency);
      audio.set('depth', depth.gain);
      setters.set('depth', (value) => {
        depth.gain.value = 0.001 + value * 0.007;
      });
      setters.set('mix', (value) => {
        wet.gain.value = value;
        dry.gain.value = 1 - value * 0.85;
      });
    } else {
      let previous: AudioNode = effectSend;
      const filters: BiquadFilterNode[] = [];
      for (let index = 0; index < 4; index += 1) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'allpass';
        filter.Q.value = 0.9;
        filter.frequency.value = 900;
        previous.connect(filter);
        previous = filter;
        filters.push(filter);
        depth.connect(filter.frequency);
      }
      const feedback = ctx.createGain();
      feedback.gain.value = 0.35;
      previous.connect(wet);
      previous.connect(feedback);
      feedback.connect(filters[0] ?? wet);
      audio.set('rate', lfo.frequency);
      audio.set('depth', depth.gain);
      audio.set('feedback', feedback.gain);
      setters.set('depth', (value) => {
        depth.gain.value = 80 + value * 1400;
      });
      setters.set('mix', (value) => {
        wet.gain.value = value;
        dry.gain.value = 1 - value * 0.65;
      });
    }
    try {
      lfo.start();
    } catch {
      /* already started */
    }
  } else {
    const gain = ctx.createGain();
    const width = buildWidth(ctx);
    effectSend.disconnect(effectOut);
    effectSend.connect(gain);
    gain.connect(width.input);
    width.output.connect(effectOut);
    audio.set('gain', gain.gain);
    audio.set('width', width.width.gain);
    setters.set('gain', (value) => {
      gain.gain.value = dbToAmp(value);
    });
  }

  const values = defaultParams(kind);
  let bypassed = false;

  const applyBypass = (): void => {
    bypassDry.gain.value = bypassed ? 1 : 0;
    effectSend.gain.value = bypassed ? 0 : 1;
  };

  const plugin: LivePlugin = {
    kind,
    input,
    output,
    bypassed,
    values,
    set(id, value) {
      const spec = pluginInfo(kind).params.find((item) => item.id === id);
      if (!spec) return;
      const next = clamp(value, spec.min, spec.max);
      values[id] = next;
      const custom = setters.get(id);
      if (custom) custom(next);
      else {
        const param = audio.get(id);
        if (param) param.value = next;
      }
    },
    setBypass(on) {
      bypassed = on;
      plugin.bypassed = on;
      applyBypass();
    },
    param(id) {
      return audio.get(id) ?? null;
    },
    reduction() {
      return reductionNode ? readReduction(reductionNode) : 0;
    },
    curve(bins) {
      if (!curveFilters || bins < 2) return null;
      return eqCurve(curveFilters, ctx.sampleRate, bins);
    },
    dispose() {
      for (const osc of oscs) {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
        safeDisconnect(osc);
      }
      safeDisconnect(input);
      safeDisconnect(output);
    },
  };

  for (const spec of pluginInfo(kind).params) plugin.set(spec.id, spec.defaultValue);
  applyBypass();
  return plugin;
}

function dbToAmp(db: number): number {
  if (db <= -59.9) return 0;
  return Math.pow(10, db / 20);
}

function tapeCurve(drive: number): Float32Array<ArrayBuffer> {
  const length = 1024;
  const curve = new Float32Array(length);
  const amount = 1 + drive * 14;
  const norm = Math.tanh(amount);
  for (let index = 0; index < length; index += 1) {
    const x = (index / (length - 1)) * 2 - 1;
    curve[index] = Math.tanh(x * amount) / norm;
  }
  return curve;
}

function eqCurve(filters: readonly BiquadFilterNode[], sampleRate: number, bins: number): Float32Array<ArrayBuffer> {
  const freqs = new Float32Array(bins);
  const nyquist = Math.max(1000, sampleRate / 2);
  for (let index = 0; index < bins; index += 1) {
    const t = index / (bins - 1);
    freqs[index] = 20 * Math.pow(nyquist / 20, t);
  }
  const mag = new Float32Array(bins);
  const phase = new Float32Array(bins);
  const acc = new Float32Array(bins);
  acc.fill(1);
  for (const filter of filters) {
    filter.getFrequencyResponse(freqs, mag, phase);
    for (let index = 0; index < bins; index += 1) acc[index] *= mag[index] ?? 1;
  }
  const db = new Float32Array(bins);
  for (let index = 0; index < bins; index += 1) db[index] = 20 * Math.log10(Math.max(1e-4, acc[index] ?? 1e-4));
  return db;
}

function buildWidth(ctx: BaseAudioContext): { input: AudioNode; output: AudioNode; width: GainNode } {
  const input = ctx.createGain();
  input.channelCount = 2;
  input.channelCountMode = 'explicit';
  input.channelInterpretation = 'speakers';
  const split = ctx.createChannelSplitter(2);
  const mid = ctx.createGain();
  const side = ctx.createGain();
  const leftMid = ctx.createGain();
  const rightMid = ctx.createGain();
  const leftSide = ctx.createGain();
  const rightSide = ctx.createGain();
  leftMid.gain.value = 0.5;
  rightMid.gain.value = 0.5;
  leftSide.gain.value = 0.5;
  rightSide.gain.value = -0.5;
  const width = ctx.createGain();
  width.gain.value = 1;
  const merge = ctx.createChannelMerger(2);
  const midL = ctx.createGain();
  const midR = ctx.createGain();
  const sideL = ctx.createGain();
  const sideR = ctx.createGain();
  sideR.gain.value = -1;
  input.connect(split);
  split.connect(leftMid, 0);
  split.connect(rightMid, 1);
  split.connect(leftSide, 0);
  split.connect(rightSide, 1);
  leftMid.connect(mid);
  rightMid.connect(mid);
  leftSide.connect(side);
  rightSide.connect(side);
  side.connect(width);
  mid.connect(midL);
  mid.connect(midR);
  width.connect(sideL);
  width.connect(sideR);
  midL.connect(merge, 0, 0);
  sideL.connect(merge, 0, 0);
  midR.connect(merge, 0, 1);
  sideR.connect(merge, 0, 1);
  return { input, output: merge, width };
}

function safeDisconnect(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    /* not connected */
  }
}

const shelf = (id: string, label: string, min: number, max: number, step: number, fallback: number, unit: PluginUnit): PluginSpec => ({
  id,
  label,
  min,
  max,
  step,
  defaultValue: fallback,
  unit,
});

const CATALOG: Record<PluginKind, PluginInfo> = {
  eq: {
    kind: 'eq',
    name: 'Channel EQ',
    blurb: 'Low shelf, mid bell, and high shelf with a response curve.',
    autoParam: 'midGain',
    params: [
      shelf('lowHz', 'Low', 40, 400, 1, 120, 'hz'),
      shelf('lowGain', 'Low', -15, 15, 0.1, 0, 'db'),
      shelf('midHz', 'Mid', 200, 5000, 1, 1000, 'hz'),
      shelf('midGain', 'Mid', -15, 15, 0.1, 0, 'db'),
      shelf('midQ', 'Q', 0.4, 8, 0.01, 1, 'q'),
      shelf('highHz', 'High', 2000, 16000, 10, 8000, 'hz'),
      shelf('highGain', 'High', -15, 15, 0.1, 0, 'db'),
    ],
    presets: [
      { name: 'Flat', values: {} },
      { name: 'Vocal', values: { lowHz: 140, lowGain: -2, midHz: 3500, midGain: 2.5, midQ: 0.9, highHz: 9000, highGain: 2 } },
      { name: 'Warm', values: { lowHz: 100, lowGain: 3, midHz: 450, midGain: -2, midQ: 0.8, highGain: -1 } },
      { name: 'Air', values: { lowGain: 0, midHz: 2500, midGain: 1, highHz: 10000, highGain: 4 } },
    ],
  },
  comp: {
    kind: 'comp',
    name: 'Compressor',
    blurb: 'Feed-forward compressor with makeup and a gain-reduction meter.',
    autoParam: 'threshold',
    params: [
      shelf('threshold', 'Thresh', -60, 0, 0.1, -18, 'db'),
      shelf('ratio', 'Ratio', 1, 20, 0.1, 3, 'ratio'),
      shelf('attack', 'Attack', 0.001, 0.2, 0.001, 0.012, 'ms'),
      shelf('release', 'Release', 0.02, 1, 0.001, 0.18, 'ms'),
      shelf('knee', 'Knee', 0, 24, 0.1, 6, 'db'),
      shelf('makeup', 'Makeup', 0, 24, 0.1, 0, 'db'),
    ],
    presets: [
      { name: 'Gentle', values: { threshold: -16, ratio: 2, attack: 0.02, release: 0.2, knee: 12, makeup: 1 } },
      { name: 'Vocal', values: { threshold: -22, ratio: 3.5, attack: 0.008, release: 0.16, knee: 8, makeup: 3 } },
      { name: 'Drum', values: { threshold: -18, ratio: 6, attack: 0.003, release: 0.12, knee: 3, makeup: 3 } },
      { name: 'Glue', values: { threshold: -14, ratio: 2.5, attack: 0.03, release: 0.3, knee: 10, makeup: 1.5 } },
    ],
  },
  tape: {
    kind: 'tape',
    name: 'Tape',
    blurb: 'Soft tanh saturation with a tone filter and dry/wet mix.',
    autoParam: 'tone',
    params: [
      shelf('drive', 'Drive', 0, 1, 0.01, 0.35, 'percent'),
      shelf('tone', 'Tone', 1200, 16000, 10, 7000, 'hz'),
      shelf('mix', 'Mix', 0, 1, 0.01, 0.7, 'percent'),
    ],
    presets: [
      { name: 'Soft', values: { drive: 0.2, tone: 9000, mix: 0.45 } },
      { name: 'Warm', values: { drive: 0.4, tone: 5500, mix: 0.75 } },
      { name: 'Hot', values: { drive: 0.75, tone: 4000, mix: 1 } },
    ],
  },
  chorus: {
    kind: 'chorus',
    name: 'Chorus',
    blurb: 'Dual modulated delays.',
    autoParam: 'rate',
    params: [
      shelf('rate', 'Rate', 0.05, 6, 0.01, 0.6, 'hz'),
      shelf('depth', 'Depth', 0, 1, 0.01, 0.45, 'percent'),
      shelf('mix', 'Mix', 0, 1, 0.01, 0.35, 'percent'),
    ],
    presets: [
      { name: 'Subtle', values: { rate: 0.35, depth: 0.25, mix: 0.2 } },
      { name: 'Wide', values: { rate: 0.5, depth: 0.6, mix: 0.45 } },
      { name: 'Fast', values: { rate: 2.4, depth: 0.35, mix: 0.3 } },
    ],
  },
  phaser: {
    kind: 'phaser',
    name: 'Phaser',
    blurb: 'Four all-pass stages swept by an LFO, with feedback.',
    autoParam: 'feedback',
    params: [
      shelf('rate', 'Rate', 0.05, 8, 0.01, 0.25, 'hz'),
      shelf('depth', 'Depth', 0, 1, 0.01, 0.6, 'percent'),
      shelf('feedback', 'Feed', 0, 0.75, 0.01, 0.35, 'percent'),
      shelf('mix', 'Mix', 0, 1, 0.01, 0.45, 'percent'),
    ],
    presets: [
      { name: 'Slow', values: { rate: 0.12, depth: 0.7, feedback: 0.4, mix: 0.5 } },
      { name: 'Fast', values: { rate: 3, depth: 0.45, feedback: 0.25, mix: 0.4 } },
      { name: 'Deep', values: { rate: 0.2, depth: 0.9, feedback: 0.65, mix: 0.6 } },
    ],
  },
  utility: {
    kind: 'utility',
    name: 'Utility',
    blurb: 'Gain and stereo width. Width at 0 is mono; 1 is unchanged.',
    autoParam: 'width',
    params: [
      shelf('gain', 'Gain', -24, 12, 0.1, 0, 'db'),
      shelf('width', 'Width', 0, 2, 0.01, 1, 'plain'),
    ],
    presets: [
      { name: 'Unity', values: { gain: 0, width: 1 } },
      { name: 'Narrow', values: { gain: 0, width: 0.35 } },
      { name: 'Wide', values: { gain: -1, width: 1.6 } },
      { name: 'Mono', values: { gain: 0, width: 0 } },
    ],
  },
  limiter: {
    kind: 'limiter',
    name: 'Limiter',
    blurb: 'Fast high-ratio limiter. Ceiling is the threshold.',
    autoParam: 'ceiling',
    params: [
      shelf('ceiling', 'Ceil', -18, 0, 0.1, -1, 'db'),
      shelf('release', 'Release', 0.01, 0.4, 0.001, 0.08, 'ms'),
    ],
    presets: [
      { name: 'Safe', values: { ceiling: -3, release: 0.1 } },
      { name: 'Transparent', values: { ceiling: -1, release: 0.06 } },
      { name: 'Loud', values: { ceiling: -0.3, release: 0.04 } },
    ],
  },
};
