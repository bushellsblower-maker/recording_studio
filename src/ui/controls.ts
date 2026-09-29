import { clamp } from '../audio/units';

export interface Control {
  root: HTMLElement;
  input: HTMLInputElement;
  set(value: number): void;
  get(): number;
}

export interface ControlOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  title?: string;
}

function quantize(value: number, min: number, max: number, step: number): number {
  const clamped = clamp(value, min, max);
  if (step <= 0) return clamped;
  const steps = Math.round((clamped - min) / step);
  const next = min + steps * step;
  return clamp(Number(next.toPrecision(12)), min, max);
}

export function createKnob(options: ControlOptions): Control {
  const root = document.createElement('div');
  root.className = 'knob';
  if (options.title) root.title = options.title;

  const dial = document.createElement('div');
  dial.className = 'knob-dial';
  dial.setAttribute('aria-hidden', 'true');
  const mark = document.createElement('span');
  mark.className = 'knob-mark';
  dial.append(mark);

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'sr-only';
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
  input.value = String(options.value);
  input.setAttribute('aria-label', options.label);

  const readout = document.createElement('span');
  readout.className = 'knob-value';
  const name = document.createElement('span');
  name.className = 'knob-label';
  name.textContent = options.label;
  root.append(dial, input, readout, name);

  let current = quantize(options.value, options.min, options.max, options.step);
  const initial = current;

  const paint = (value: number): void => {
    const span = options.max - options.min || 1;
    const norm = (value - options.min) / span;
    const angle = -135 + norm * 270;
    mark.style.transform = `rotate(${angle}deg)`;
    readout.textContent = options.format(value);
    input.setAttribute('aria-valuetext', options.format(value));
  };

  const commit = (value: number, notify: boolean): void => {
    current = quantize(value, options.min, options.max, options.step);
    input.value = String(current);
    paint(current);
    if (notify) options.onChange(current);
  };

  input.addEventListener('input', () => commit(Number(input.value), true));
  dial.addEventListener('dblclick', () => commit(initial, true));
  dial.addEventListener('wheel', (event) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const amount = (options.max - options.min) * (event.shiftKey ? 0.002 : 0.01);
    commit(current + direction * amount, true);
  }, { passive: false });
  dial.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dial.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const start = current;
    const move = (ev: PointerEvent): void => {
      const dy = startY - ev.clientY;
      const span = options.max - options.min;
      const fine = ev.shiftKey ? 0.15 : 1;
      commit(start + (dy / 150) * span * fine, true);
    };
    const up = (ev: PointerEvent): void => {
      dial.removeEventListener('pointermove', move);
      dial.removeEventListener('pointerup', up);
      if (dial.hasPointerCapture(ev.pointerId)) dial.releasePointerCapture(ev.pointerId);
    };
    dial.addEventListener('pointermove', move);
    dial.addEventListener('pointerup', up);
  });

  commit(current, false);
  return {
    root,
    input,
    set: (value) => commit(value, true),
    get: () => current,
  };
}

export function createFader(options: ControlOptions): Control {
  const root = document.createElement('div');
  root.className = 'fader';
  if (options.title) root.title = options.title;

  const col = document.createElement('div');
  col.className = 'fader-col';
  const track = document.createElement('div');
  track.className = 'fader-track';
  const fill = document.createElement('div');
  fill.className = 'fader-fill';
  const cap = document.createElement('div');
  cap.className = 'fader-cap';
  track.append(fill, cap);
  col.append(track);

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'sr-only';
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
  input.value = String(options.value);
  input.setAttribute('aria-label', options.label);

  const readout = document.createElement('span');
  readout.className = 'fader-value';
  const name = document.createElement('span');
  name.className = 'fader-label';
  name.textContent = options.label;
  root.append(col, readout, name, input);

  let current = quantize(options.value, options.min, options.max, options.step);
  const initial = current;

  const paint = (value: number): void => {
    const span = options.max - options.min || 1;
    const norm = (value - options.min) / span;
    fill.style.height = `${norm * 100}%`;
    cap.style.bottom = `calc(${norm * 100}% - 5px)`;
    readout.textContent = options.format(value);
    input.setAttribute('aria-valuetext', options.format(value));
  };

  const commit = (value: number, notify: boolean): void => {
    current = quantize(value, options.min, options.max, options.step);
    input.value = String(current);
    paint(current);
    if (notify) options.onChange(current);
  };

  const valueFromY = (clientY: number): number => {
    const rect = track.getBoundingClientRect();
    const norm = rect.height <= 0 ? 0 : 1 - (clientY - rect.top) / rect.height;
    return options.min + clamp(norm, 0, 1) * (options.max - options.min);
  };

  input.addEventListener('input', () => commit(Number(input.value), true));
  track.addEventListener('dblclick', () => commit(initial, true));
  track.addEventListener('wheel', (event) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const amount = (options.max - options.min) * (event.shiftKey ? 0.002 : 0.01);
    commit(current + direction * amount, true);
  }, { passive: false });
  track.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    track.setPointerCapture(event.pointerId);
    commit(valueFromY(event.clientY), true);
    const move = (ev: PointerEvent): void => commit(valueFromY(ev.clientY), true);
    const up = (ev: PointerEvent): void => {
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', up);
      if (track.hasPointerCapture(ev.pointerId)) track.releasePointerCapture(ev.pointerId);
    };
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', up);
  });

  commit(current, false);
  return {
    root,
    input,
    set: (value) => commit(value, true),
    get: () => current,
  };
}
