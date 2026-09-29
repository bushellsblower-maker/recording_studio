import { makeImpulse } from './impulse';
import { clampParams, createPlugin, type PluginKind } from './plugins';

export interface BounceInsert {
  kind: PluginKind;
  bypass: boolean;
  params: Record<string, number>;
}

export interface BounceTrack {
  buffer: AudioBuffer;
  rate: number;
  startSec: number;
  trimStart: number;
  trimEnd: number;
  fadeInSec: number;
  fadeOutSec: number;
  gain: number;
  pan: number;
  mono: boolean;
  delaySend: number;
  reverbSend: number;
  inserts: BounceInsert[];
  volumeAuto: { beat: number; value: number }[];
  panAuto: { beat: number; value: number }[];
}

export interface BounceOptions {
  sampleRate: number;
  duration: number;
  tracks: BounceTrack[];
  masterGain: number;
  delayTime: number;
  delayFeedback: number;
  delayDamp: number;
  reverbDecay: number;
  bpm: number;
  /** When set, only that track index is rendered, without send returns. */
  stemIndex?: number;
}

/** Offline render through insert chains, fades, pan, and the shared returns. */
export async function renderBounce(options: BounceOptions): Promise<AudioBuffer> {
  const frames = Math.max(1, Math.ceil(options.duration * options.sampleRate));
  const ctx = new OfflineAudioContext(2, frames, options.sampleRate);
  const master = ctx.createGain();
  master.gain.value = options.masterGain;
  const safety = ctx.createDynamicsCompressor();
  safety.threshold.value = -1.2;
  safety.knee.value = 0;
  safety.ratio.value = 12;
  safety.attack.value = 0.002;
  safety.release.value = 0.08;
  master.connect(safety);
  safety.connect(ctx.destination);

  const delayIn = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = options.delayTime;
  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.value = options.delayDamp;
  const delayFb = ctx.createGain();
  delayFb.gain.value = options.delayFeedback;
  delayIn.connect(delay);
  delay.connect(master);
  delay.connect(delayFilter);
  delayFilter.connect(delayFb);
  delayFb.connect(delayIn);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, options.reverbDecay);
  convolver.connect(master);

  const stem = options.stemIndex;
  options.tracks.forEach((track, index) => {
    if (stem !== undefined && stem !== index) return;
    const source = ctx.createBufferSource();
    source.buffer = track.buffer;
    source.playbackRate.value = track.rate;
    const fade = ctx.createGain();
    const fader = ctx.createGain();
    const panner = ctx.createStereoPanner();
    scheduleRide(fader.gain, track.volumeAuto, track.gain, options.bpm, true);
    scheduleRide(panner.pan, track.panAuto, track.pan, options.bpm, false);
    const inserts = track.inserts.map((insert) => {
      const plugin = createPlugin(ctx, insert.kind);
      plugin.setBypass(insert.bypass);
      const params = clampParams(insert.kind, insert.params);
      for (const [id, value] of Object.entries(params)) plugin.set(id, value);
      return plugin;
    });
    source.connect(fade);
    let cursor: AudioNode = fade;
    for (const plugin of inserts) {
      cursor.connect(plugin.input);
      cursor = plugin.output;
    }
    cursor.connect(fader);
    fader.connect(panner);
    const audible = track.mono ? monoSum(ctx, panner) : panner;
    audible.connect(master);
    if (stem === undefined) {
      if (track.delaySend > 0.001) {
        const send = ctx.createGain();
        send.gain.value = track.delaySend;
        audible.connect(send);
        send.connect(delayIn);
      }
      if (track.reverbSend > 0.001) {
        const send = ctx.createGain();
        send.gain.value = track.reverbSend;
        audible.connect(send);
        send.connect(convolver);
      }
    }
    const trimEnd = track.trimEnd > 0 ? track.trimEnd : track.buffer.duration;
    const offset = Math.min(track.buffer.duration - 0.001, Math.max(0, track.trimStart));
    const available = Math.max(0, trimEnd - offset);
    const duration = Math.min(available, track.buffer.duration - offset);
    if (duration < 0.005) return;
    const start = Math.max(0, track.startSec);
    const end = start + duration / Math.max(0.001, track.rate);
    scheduleFade(fade.gain, start, end, track.fadeInSec, track.fadeOutSec);
    source.start(start, offset, duration);
  });

  return ctx.startRendering();
}

function monoSum(ctx: BaseAudioContext, source: AudioNode): AudioNode {
  const split = ctx.createChannelSplitter(2);
  const sum = ctx.createGain();
  sum.gain.value = 0.5;
  const merge = ctx.createChannelMerger(2);
  source.connect(split);
  split.connect(sum, 0);
  split.connect(sum, 1);
  sum.connect(merge, 0, 0);
  sum.connect(merge, 0, 1);
  return merge;
}

function scheduleRide(
  param: AudioParam,
  points: { beat: number; value: number }[],
  fallback: number,
  bpm: number,
  asDb: boolean,
): void {
  const convert = (value: number): number => (asDb ? Math.pow(10, Math.max(-60, value) / 20) : value);
  if (points.length === 0) {
    param.value = fallback;
    return;
  }
  const sorted = [...points].sort((a, b) => a.beat - b.beat);
  const spb = 60 / Math.max(1, bpm);
  param.setValueAtTime(convert(sorted[0]?.value ?? 0), 0);
  for (const point of sorted) param.linearRampToValueAtTime(convert(point.value), Math.max(0, point.beat * spb));
}

function scheduleFade(gain: AudioParam, start: number, end: number, fadeIn: number, fadeOut: number): void {
  const span = Math.max(0.001, end - start);
  const inSec = Math.min(fadeIn, span * 0.45);
  const outSec = Math.min(fadeOut, span * 0.45);
  gain.setValueAtTime(inSec > 0.001 ? 0.0001 : 1, start);
  if (inSec > 0.001) gain.linearRampToValueAtTime(1, start + inSec);
  const outAt = Math.max(start + inSec, end - outSec);
  gain.setValueAtTime(1, outAt);
  if (outSec > 0.001) gain.linearRampToValueAtTime(0.0001, end);
}
