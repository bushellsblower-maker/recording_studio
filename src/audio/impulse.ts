/** Exponential stereo noise burst used as a ConvolverNode impulse. */
export function makeImpulse(ctx: BaseAudioContext, durationSec: number): AudioBuffer {
  const duration = Math.min(6, Math.max(0.2, durationSec));
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let lowpass = 0;
    const coefficient = channel === 0 ? 0.28 : 0.36;
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate;
      const envelope = Math.exp((-6.9 * t) / duration);
      const noise = Math.random() * 2 - 1;
      lowpass += coefficient * (noise - lowpass);
      data[i] = lowpass * envelope;
    }
  }
  return buffer;
}

export function makeNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
