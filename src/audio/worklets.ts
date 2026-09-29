/**
 * AudioWorklet processors as a classic script. Loaded from a blob URL so the
 * Vite build does not need a separate worklet pipeline.
 * Gate: envelope follower with hysteresis. Recorder: stereo capture that
 * starts on the audio clock and posts transferred chunks to the main thread.
 */
export const WORKLET_SOURCE = `
class StudioGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -48, minValue: -90, maxValue: 0, automationRate: 'k-rate' },
      { name: 'attack', defaultValue: 0.005, minValue: 0.0005, maxValue: 0.2, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.1, minValue: 0.005, maxValue: 1, automationRate: 'k-rate' },
      { name: 'enabled', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.env = 0;
    this.gain = 1;
    this.open = false;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0 || !output[0]) return true;
    const frames = output[0].length;
    const input = inputs[0];
    const enabled = parameters.enabled[0] >= 0.5;
    const openT = Math.pow(10, parameters.threshold[0] / 20);
    const closeT = openT * 0.62;
    const attack = Math.max(0.0005, parameters.attack[0]);
    const release = Math.max(0.005, parameters.release[0]);
    const attackCoef = Math.exp(-1 / (attack * sampleRate));
    const releaseCoef = Math.exp(-1 / (release * sampleRate));

    for (let i = 0; i < frames; i++) {
      let detect = 0;
      if (input) {
        for (let c = 0; c < input.length; c++) {
          const channel = input[c];
          if (!channel) continue;
          const abs = Math.abs(channel[i] || 0);
          if (abs > detect) detect = abs;
        }
      }
      const follow = detect > this.env ? attackCoef : releaseCoef;
      this.env = follow * this.env + (1 - follow) * detect;
      if (!this.open && this.env >= openT) this.open = true;
      else if (this.open && this.env < closeT) this.open = false;
      const target = !enabled || this.open ? 1 : 0;
      const gainCoef = target > this.gain ? attackCoef : releaseCoef;
      this.gain = gainCoef * this.gain + (1 - gainCoef) * target;
      for (let c = 0; c < output.length; c++) {
        const source = input && input[c] ? input[c] : input && input[0] ? input[0] : null;
        const sample = source ? source[i] || 0 : 0;
        output[c][i] = sample * this.gain;
      }
    }
    return true;
  }
}

class StudioRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.startTime = null;
    this.id = 0;
    this.chunksL = [];
    this.chunksR = [];
    this.acc = 0;
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'start') {
        this.recording = false;
        this.id = typeof data.id === 'number' ? data.id : 0;
        this.startTime = typeof data.time === 'number' ? data.time : currentTime;
      } else if (data.type === 'stop') {
        this.recording = false;
        this.startTime = null;
        if (typeof data.id === 'number') this.id = data.id;
        this.flush(true);
      }
    };
  }

  flush(final) {
    const id = this.id;
    if (this.acc > 0) {
      const left = new Float32Array(this.acc);
      const right = new Float32Array(this.acc);
      let offset = 0;
      for (let i = 0; i < this.chunksL.length; i++) {
        left.set(this.chunksL[i], offset);
        right.set(this.chunksR[i], offset);
        offset += this.chunksL[i].length;
      }
      this.chunksL = [];
      this.chunksR = [];
      this.acc = 0;
      this.port.postMessage({ type: 'chunk', id: id, left: left, right: right }, [left.buffer, right.buffer]);
    }
    if (final) this.port.postMessage({ type: 'end', id: id });
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const frames = output && output[0] ? output[0].length : 128;
    if (output) {
      for (let c = 0; c < output.length; c++) output[c].fill(0);
    }

    let skip = 0;
    if (!this.recording) {
      if (this.startTime == null) return true;
      const blockEnd = currentTime + frames / sampleRate;
      if (blockEnd <= this.startTime) return true;
      if (currentTime < this.startTime) {
        skip = Math.min(frames, Math.round((this.startTime - currentTime) * sampleRate));
      }
      this.recording = true;
      this.startTime = null;
    }

    const count = frames - skip;
    if (count <= 0) return true;
    const input = inputs[0];
    const srcL = input && input[0] ? input[0] : null;
    const srcR = input && input[1] ? input[1] : srcL;
    const left = new Float32Array(count);
    const right = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      left[i] = srcL ? srcL[i + skip] || 0 : 0;
      right[i] = srcR ? srcR[i + skip] || 0 : left[i];
    }
    this.chunksL.push(left);
    this.chunksR.push(right);
    this.acc += count;
    if (this.acc >= 4096) this.flush(false);
    return true;
  }
}

registerProcessor('studio-gate', StudioGate);
registerProcessor('studio-recorder', StudioRecorder);
`;
