/** Lookahead click scheduled on the audio clock. Cue only — not recorded. */
export class Metronome {
  bpm = 100;
  level = 0.25;

  private timer = 0;
  private next = 0;
  private beat = 0;
  private running = false;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
  ) {}

  start(at: number): void {
    this.stop();
    this.running = true;
    this.beat = 0;
    this.next = at;
    this.timer = window.setInterval(() => this.tick(), 25);
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = 0;
    }
  }

  private tick(): void {
    if (!this.running) return;
    if (this.next < this.ctx.currentTime + 0.005) {
      this.next = this.ctx.currentTime + 0.02;
    }
    const horizon = this.ctx.currentTime + 0.12;
    const interval = 60 / Math.max(1, this.bpm);
    while (this.next < horizon) {
      this.click(this.next, this.beat % 4 === 0);
      this.beat += 1;
      this.next += interval;
    }
  }

  private click(time: number, accent: boolean): void {
    if (time < this.ctx.currentTime) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(accent ? 1760 : 1175, time);
    const peak = Math.max(0.0001, accent ? this.level : this.level * 0.55);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    osc.connect(gain);
    gain.connect(this.destination);
    osc.start(time);
    osc.stop(time + 0.05);
  }
}
