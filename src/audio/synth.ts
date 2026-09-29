export interface HeldNote {
  release(when: number): void;
}

export interface SynthVoice {
  velocity?: number;
  wave?: OscillatorType;
  cutoff?: number;
  resonance?: number;
  attack?: number;
  release?: number;
  level?: number;
}

/** Subtractive key voice: oscillator, low-pass, and an amplitude envelope. */
export function startNote(
  ctx: AudioContext,
  destination: AudioNode,
  midi: number,
  when: number,
  voice: SynthVoice = {},
): HeldNote {
  const velocity = clamp01(voice.velocity ?? 0.85);
  const level = clamp01(voice.level ?? 0.8);
  const wave = voice.wave ?? 'sawtooth';
  const cutoff = clamp(voice.cutoff ?? 1800, 80, 12000);
  const resonance = clamp(voice.resonance ?? 0.7, 0.2, 12);
  const attack = clamp(voice.attack ?? 0.01, 0.002, 0.6);
  const release = clamp(voice.release ?? 0.18, 0.02, 1.5);
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const peak = Math.max(0.0001, (0.04 + velocity * 0.22) * (0.35 + level * 0.65));

  const osc = ctx.createOscillator();
  const body = ctx.createOscillator();
  osc.type = wave;
  body.type = wave === 'square' ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(freq, when);
  body.frequency.setValueAtTime(freq * 2, when);
  osc.detune.setValueAtTime(-6, when);
  body.detune.setValueAtTime(8, when);

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(wave === 'sine' ? 0.08 : 0.18, when);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.setValueAtTime(resonance, when);
  filter.frequency.setValueAtTime(Math.max(80, cutoff * 0.45), when);
  filter.frequency.exponentialRampToValueAtTime(Math.max(90, cutoff), when + attack);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(peak, when + attack);
  const sustain = peak * (0.55 + velocity * 0.2);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), when + attack + 0.18);

  osc.connect(filter);
  body.connect(bodyGain);
  bodyGain.connect(filter);
  filter.connect(amp);
  amp.connect(destination);
  osc.start(when);
  body.start(when);

  let released = false;
  return {
    release(time: number) {
      if (released) return;
      released = true;
      const at = Math.max(time, when + attack);
      amp.gain.cancelScheduledValues(at);
      const current = Math.max(0.0001, sustain);
      amp.gain.setValueAtTime(current, at);
      amp.gain.exponentialRampToValueAtTime(0.0001, at + release);
      filter.frequency.cancelScheduledValues(at);
      filter.frequency.setValueAtTime(Math.max(90, cutoff), at);
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.4), at + release);
      osc.stop(at + release + 0.02);
      body.stop(at + release + 0.02);
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
