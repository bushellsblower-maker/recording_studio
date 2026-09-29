import type { RangeSpec } from '../defaults';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampRange(value: number, range: RangeSpec): number {
  return clamp(value, range.min, range.max);
}

/** Linear amplitude. -60 dB and below is treated as silence. */
export function dbToGain(db: number): number {
  if (db <= -59.9) return 0;
  return Math.pow(10, db / 20);
}

export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const whole = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${tenths}`;
}

export function formatDb(db: number): string {
  if (db <= -59.5) return '-inf';
  const rounded = Math.round(db * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)} dB`;
}

export function formatHz(hz: number): string {
  if (hz >= 1000) {
    const digits = hz >= 10000 ? 1 : 2;
    return `${(hz / 1000).toFixed(digits)} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

export function formatMs(seconds: number): string {
  const ms = seconds * 1000;
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)} : 1`;
}

export function formatQ(q: number): string {
  return `Q ${q.toFixed(2)}`;
}

export function formatPan(pan: number): string {
  if (Math.abs(pan) < 0.02) return 'C';
  const amount = Math.round(Math.abs(pan) * 100);
  return pan < 0 ? `L ${amount}` : `R ${amount}`;
}

export function formatPercent(amount: number): string {
  return `${Math.round(amount * 100)}%`;
}

export function formatBpm(bpm: number): string {
  return `${Math.round(bpm)} bpm`;
}

export function formatBarBeat(bar: number, beat: number): string {
  const safeBar = Number.isFinite(bar) && bar > 0 ? Math.floor(bar) : 1;
  const safeBeat = Number.isFinite(beat) && beat > 0 ? Math.floor(beat) : 1;
  return `${String(safeBar).padStart(3, '0')}.${safeBeat}`;
}

/** Compact bar.beat (and 16th) from a beat offset in 4/4. Beat 0 is bar 1, beat 1. */
export function formatBeatPosition(beat: number): string {
  const safe = Number.isFinite(beat) ? Math.max(0, beat) : 0;
  const bar = Math.floor(safe / 4) + 1;
  const into = safe - (bar - 1) * 4;
  const beatNo = Math.floor(into) + 1;
  const ticks = Math.round((into - Math.floor(into)) * 4);
  if (ticks > 0 && ticks < 4) return `${bar}.${beatNo}.${ticks}`;
  return `${bar}.${beatNo}`;
}

/** 1-based bar and beat in 4/4 from a musical time in seconds. */
export function musicalPosition(seconds: number, bpm: number): { bar: number; beat: number } {
  const secondsPerBeat = 60 / Math.max(1, bpm);
  const beats = Math.max(0, seconds) / secondsPerBeat;
  return {
    bar: Math.floor(beats / 4) + 1,
    beat: Math.floor(beats % 4) + 1,
  };
}

export function meterPercent(linear: number): number {
  const db = linear <= 0.00001 ? -80 : 20 * Math.log10(linear);
  const normalized = (db - -48) / 48;
  return clamp(normalized, 0, 1) * 100;
}

export function formatMeterDb(linear: number): string {
  if (linear <= 0.00001) return '-inf';
  const db = 20 * Math.log10(linear);
  return `${db.toFixed(1)}`;
}
