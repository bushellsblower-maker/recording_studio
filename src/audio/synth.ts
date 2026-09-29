export interface HeldNote {
  release(when: number): void;
}

/** Small triangle/FM key voice used by the on-screen keyboard. */
export function startNote(ctx: AudioContext, destination: AudioNode, midi: number, when: number): HeldNote {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const osc = ctx.createOscillator();
  const overtone = ctx.createOscillator();
  osc.type = 'triangle';
  overtone.type = 'sine';
  osc.frequency.setValueAtTime(freq, when);
  overtone.frequency.setValueAtTime(freq * 2, when);

  const overtoneGain = ctx.createGain();
  overtoneGain.gain.setValueAtTime(0.15, when);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1600, when);
  filter.Q.setValueAtTime(0.7, when);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(0.2, when + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.11, when + 0.16);

  osc.connect(filter);
  overtone.connect(overtoneGain);
  overtoneGain.connect(filter);
  filter.connect(amp);
  amp.connect(destination);
  osc.start(when);
  overtone.start(when);

  let released = false;
  return {
    release(time: number) {
      if (released) return;
      released = true;
      const at = Math.max(time, when + 0.02);
      amp.gain.cancelScheduledValues(at);
      amp.gain.setValueAtTime(0.11, at);
      amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.stop(at + 0.18);
      overtone.stop(at + 0.18);
    },
  };
}
