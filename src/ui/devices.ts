import { SCENE_COUNT, PLUGIN_KINDS, formatPluginValue, pluginInfo, type PluginKind } from '../audio/plugins';
import { formatHz, formatPercent } from '../audio/units';
import type { AutoPoint, EngineSnapshot, FolderId, LaunchQuant, SynthSettings } from '../types';

export interface DeviceHandlers {
  setInsert: (track: number, slot: number, kind: PluginKind | null) => void;
  moveInsert: (track: number, from: number, to: number) => void;
  bypass: (track: number, slot: number, bypass: boolean) => void;
  param: (track: number, slot: number, id: string, value: number) => void;
  preset: (track: number, slot: number, name: string) => void;
  send: (track: number, which: 'delay' | 'reverb', amount: number) => void;
  mono: (track: number, mono: boolean) => void;
  folder: (track: number, folder: FolderId) => void;
  muteFolder: (folder: 1 | 2) => void;
  copySlot: (track: number, slot: number) => void;
  clearSlot: (track: number, slot: number) => void;
  launchSlot: (track: number, slot: number) => void;
  launchScene: (slot: number) => void;
  back: () => void;
  quant: (quant: LaunchQuant) => void;
  auto: (track: number, lane: 'volume' | 'pan' | 'fx', beat: number, value: number) => void;
  removeAuto: (track: number, lane: 'volume' | 'pan' | 'fx', beat: number) => void;
  clearAuto: (track: number, lane: 'volume' | 'pan' | 'fx') => void;
  synth: (partial: Partial<SynthSettings>) => void;
}

export interface DevicePanel {
  element: HTMLElement;
  render: (snapshot: EngineSnapshot, track: number) => void;
  paint: (frame: { reductions: readonly number[]; eq: readonly number[] | null }) => void;
}

export function buildDevices(handlers: DeviceHandlers): DevicePanel {
  const element = document.createElement('section');
  element.className = 'zone zone-devices';

  const head = document.createElement('div');
  head.className = 'zone-head';
  const title = document.createElement('h2');
  title.textContent = 'Devices';
  const which = document.createElement('span');
  which.className = 'note device-which';
  head.append(title, which);

  const grid = document.createElement('div');
  grid.className = 'device-grid';

  const session = document.createElement('div');
  session.className = 'device-card';
  const slots = document.createElement('div');
  slots.className = 'scene-slots';
  const scenes = document.createElement('div');
  scenes.className = 'scene-launch';
  const quant = document.createElement('button');
  quant.type = 'button';
  quant.className = 'btn tiny';
  quant.addEventListener('click', () => {
    if (!last) return;
    handlers.quant(last.launchQuant === 'bar' ? 'beat' : 'bar');
  });
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn tiny';
  back.textContent = 'Arrangement';
  back.title = 'Stop session clips and return every track to the arrangement';
  back.addEventListener('click', () => handlers.back());
  session.append(cardTitle('Session'), scenes, slots, rowOf(quant, back));

  const sceneButtons: HTMLButtonElement[] = [];
  for (let slot = 0; slot < SCENE_COUNT; slot += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn tiny';
    button.textContent = `Scene ${slot + 1}`;
    button.addEventListener('click', () => handlers.launchScene(slot));
    scenes.append(button);
    sceneButtons.push(button);
  }

  const slotButtons: HTMLButtonElement[] = [];
  const captureButtons: HTMLButtonElement[] = [];
  for (let slot = 0; slot < SCENE_COUNT; slot += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn tiny scene-slot';
    button.textContent = `Slot ${slot + 1}`;
    button.addEventListener('click', (event) => {
      if (!last) return;
      if (event.shiftKey || event.altKey) handlers.clearSlot(trackIndex, slot);
      else handlers.launchSlot(trackIndex, slot);
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      handlers.clearSlot(trackIndex, slot);
    });
    const capture = document.createElement('button');
    capture.type = 'button';
    capture.className = 'btn tiny';
    capture.textContent = 'Capture';
    capture.title = 'Copy the arrangement clip into this slot';
    capture.addEventListener('click', () => handlers.copySlot(trackIndex, slot));
    const pair = document.createElement('div');
    pair.className = 'slot-pair';
    pair.append(button, capture);
    slots.append(pair);
    slotButtons.push(button);
    captureButtons.push(capture);
  }

  const mixer = document.createElement('div');
  mixer.className = 'device-card';
  const delay = range('Delay send', 0, 1, 0.01, (value) => handlers.send(trackIndex, 'delay', value));
  const reverb = range('Reverb send', 0, 1, 0.01, (value) => handlers.send(trackIndex, 'reverb', value));
  const mono = document.createElement('button');
  mono.type = 'button';
  mono.className = 'btn tiny';
  mono.textContent = 'Stereo';
  mono.addEventListener('click', () => {
    const track = last?.tracks[trackIndex];
    if (!track) return;
    handlers.mono(trackIndex, !track.mono);
  });
  const folder = document.createElement('select');
  folder.setAttribute('aria-label', 'Track group');
  for (const [value, label] of [
    ['0', 'No group'],
    ['1', 'Group 1'],
    ['2', 'Group 2'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    folder.append(option);
  }
  folder.addEventListener('change', () => {
    const value = Number(folder.value);
    const next: FolderId = value === 1 || value === 2 ? value : 0;
    handlers.folder(trackIndex, next);
  });
  const group1 = document.createElement('button');
  group1.type = 'button';
  group1.className = 'btn tiny';
  group1.textContent = 'Mute group 1';
  group1.addEventListener('click', () => handlers.muteFolder(1));
  const group2 = document.createElement('button');
  group2.type = 'button';
  group2.className = 'btn tiny';
  group2.textContent = 'Mute group 2';
  group2.addEventListener('click', () => handlers.muteFolder(2));
  mixer.append(cardTitle('Channel'), delay.root, reverb.root, rowOf(mono, folder), rowOf(group1, group2));

  const rack = document.createElement('div');
  rack.className = 'device-card device-rack';
  const rackHost = document.createElement('div');
  rackHost.className = 'rack-slots';
  const curve = document.createElement('canvas');
  curve.className = 'eq-curve';
  curve.width = 280;
  curve.height = 72;
  const gr = document.createElement('div');
  gr.className = 'gr-read';
  gr.textContent = 'GR 0';
  rack.append(cardTitle('Inserts'), rackHost, curve, gr);

  const autoCard = document.createElement('div');
  autoCard.className = 'device-card';
  const lanePick = document.createElement('select');
  lanePick.setAttribute('aria-label', 'Automation lane');
  for (const [value, label] of [
    ['volume', 'Volume'],
    ['pan', 'Pan'],
    ['fx', 'FX param'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    lanePick.append(option);
  }
  const clearLane = document.createElement('button');
  clearLane.type = 'button';
  clearLane.className = 'btn tiny';
  clearLane.textContent = 'Clear lane';
  clearLane.addEventListener('click', () => handlers.clearAuto(trackIndex, laneName()));
  const autoCanvas = document.createElement('canvas');
  autoCanvas.className = 'auto-lane';
  autoCanvas.addEventListener('pointerdown', (event) => {
    if (!last) return;
    const point = autoPoint(autoCanvas, event, laneName(), last, trackIndex);
    if (!point) return;
    if (event.altKey) {
      handlers.removeAuto(trackIndex, laneName(), point.beat);
      return;
    }
    autoCanvas.setPointerCapture(event.pointerId);
    handlers.auto(trackIndex, laneName(), point.beat, point.value);
  });
  autoCanvas.addEventListener('pointermove', (event) => {
    if (!last || !autoCanvas.hasPointerCapture(event.pointerId)) return;
    const point = autoPoint(autoCanvas, event, laneName(), last, trackIndex);
    if (!point) return;
    handlers.auto(trackIndex, laneName(), point.beat, point.value);
  });
  const autoHint = document.createElement('p');
  autoHint.className = 'note';
  autoHint.textContent = 'Click the lane to write a point. Alt-click removes the nearest one. Volume and pan ride playback and bounce.';
  autoCard.append(cardTitle('Automation'), rowOf(lanePick, clearLane), autoCanvas, autoHint);

  const synthCard = document.createElement('div');
  synthCard.className = 'device-card';
  const wave = document.createElement('select');
  wave.setAttribute('aria-label', 'Synth waveform');
  for (const name of ['sawtooth', 'square', 'triangle', 'sine'] as const) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    wave.append(option);
  }
  wave.addEventListener('change', () => {
    const value = wave.value;
    if (value === 'sawtooth' || value === 'square' || value === 'triangle' || value === 'sine') handlers.synth({ wave: value });
  });
  const cutoff = range('Cutoff', 80, 12000, 1, (value) => handlers.synth({ cutoff: value }), formatHz);
  const resonance = range('Reso', 0.2, 12, 0.01, (value) => handlers.synth({ resonance: value }), (value) => value.toFixed(2));
  const attack = range('Attack', 0.002, 0.4, 0.001, (value) => handlers.synth({ attack: value }), (value) => `${Math.round(value * 1000)} ms`);
  const release = range('Release', 0.02, 1.2, 0.001, (value) => handlers.synth({ release: value }), (value) => `${Math.round(value * 1000)} ms`);
  const level = range('Level', 0, 1, 0.01, (value) => handlers.synth({ level: value }), formatPercent);
  synthCard.append(cardTitle('Desk synth'), wave, cutoff.root, resonance.root, attack.root, release.root, level.root);

  grid.append(session, mixer, rack, autoCard, synthCard);
  element.append(head, grid);

  let last: EngineSnapshot | null = null;
  let trackIndex = 0;
  let rackKey = '';
  let dragFrom = -1;

  function laneName(): 'volume' | 'pan' | 'fx' {
    const value = lanePick.value;
    return value === 'pan' || value === 'fx' ? value : 'volume';
  }

  function render(snapshot: EngineSnapshot, track: number): void {
    last = snapshot;
    trackIndex = track;
    const row = snapshot.tracks[track];
    if (!row) return;
    which.textContent = `${row.kind === 'instrument' ? 'Inst' : 'Audio'} ${track + 1}${row.name ? ` · ${row.name}` : ''}`;
    quant.textContent = snapshot.launchQuant === 'bar' ? 'Quant: bar' : 'Quant: beat';
    quant.classList.toggle('on', true);
    if (document.activeElement !== delay.input) delay.set(row.delaySend);
    if (document.activeElement !== reverb.input) reverb.set(row.reverbSend);
    mono.textContent = row.mono ? 'Mono' : 'Stereo';
    mono.classList.toggle('on', row.mono);
    if (document.activeElement !== folder) folder.value = String(row.folder);
    row.slots.forEach((slot, index) => {
      const button = slotButtons[index];
      if (!button) return;
      const active = row.sessionSlot === index;
      button.textContent = slot ? slot.name || `Slot ${index + 1}` : `Empty ${index + 1}`;
      button.classList.toggle('on', active);
      button.title = slot ? 'Launch this clip. Shift-click or right-click clears it.' : 'Capture the arrangement clip, then launch it.';
    });
    const key = row.inserts.map((insert) => (insert ? `${insert.kind}:${insert.bypass}` : 'empty')).join('|');
    if (key !== rackKey) {
      rackKey = key;
      rebuildRack(row);
    } else {
      syncRack(row);
    }
    const synth = snapshot.synth;
    if (document.activeElement !== wave) wave.value = synth.wave;
    if (document.activeElement !== cutoff.input) cutoff.set(synth.cutoff);
    if (document.activeElement !== resonance.input) resonance.set(synth.resonance);
    if (document.activeElement !== attack.input) attack.set(synth.attack);
    if (document.activeElement !== release.input) release.set(synth.release);
    if (document.activeElement !== level.input) level.set(synth.level);
    const scale = laneScale(laneName(), row);
    drawAuto(autoCanvas, pointsFor(row, laneName()), scale.min, scale.max);
  }

  function pointsFor(row: EngineSnapshot['tracks'][number], lane: 'volume' | 'pan' | 'fx'): AutoPoint[] {
    if (lane === 'pan') return row.panAuto;
    if (lane === 'fx') return row.fxAuto;
    return row.volumeAuto;
  }

  function rebuildRack(row: EngineSnapshot['tracks'][number]): void {
    rackHost.replaceChildren();
    row.inserts.forEach((insert, slot) => {
      const card = document.createElement('div');
      card.className = 'insert-slot';
      card.draggable = true;
      card.addEventListener('dragstart', (event) => {
        dragFrom = slot;
        event.dataTransfer?.setData('text/plain', String(slot));
      });
      card.addEventListener('dragover', (event) => event.preventDefault());
      card.addEventListener('drop', (event) => {
        event.preventDefault();
        const from = dragFrom;
        dragFrom = -1;
        if (from >= 0 && from !== slot) handlers.moveInsert(trackIndex, from, slot);
      });
      const pick = document.createElement('select');
      pick.setAttribute('aria-label', `Insert slot ${slot + 1}`);
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = `Slot ${slot + 1}`;
      pick.append(empty);
      for (const kind of PLUGIN_KINDS) {
        const option = document.createElement('option');
        option.value = kind;
        option.textContent = pluginInfo(kind).name;
        pick.append(option);
      }
      pick.value = insert?.kind ?? '';
      pick.addEventListener('change', () => {
        const value = pick.value;
        handlers.setInsert(trackIndex, slot, value ? (value as PluginKind) : null);
      });
      card.append(pick);
      if (insert) {
        const info = pluginInfo(insert.kind);
        const bypass = document.createElement('button');
        bypass.type = 'button';
        bypass.className = 'btn tiny';
        bypass.textContent = insert.bypass ? 'Bypassed' : 'In';
        bypass.classList.toggle('on', !insert.bypass);
        bypass.addEventListener('click', () => handlers.bypass(trackIndex, slot, !insert.bypass));
        const presets = document.createElement('select');
        presets.setAttribute('aria-label', `${info.name} preset`);
        const none = document.createElement('option');
        none.value = '';
        none.textContent = 'Preset';
        presets.append(none);
        for (const preset of info.presets) {
          const option = document.createElement('option');
          option.value = preset.name;
          option.textContent = preset.name;
          presets.append(option);
        }
        presets.addEventListener('change', () => {
          if (presets.value) handlers.preset(trackIndex, slot, presets.value);
          presets.value = '';
        });
        const blurb = document.createElement('p');
        blurb.className = 'note';
        blurb.textContent = `${info.blurb} Automation rides ${info.autoParam}.`;
        card.append(rowOf(bypass, presets), blurb);
        for (const spec of info.params) {
          const control = range(spec.label, spec.min, spec.max, spec.step, (value) => {
            handlers.param(trackIndex, slot, spec.id, value);
          }, (value) => formatPluginValue(spec, value));
          control.input.dataset.param = spec.id;
          control.input.dataset.slot = String(slot);
          control.set(insert.params[spec.id] ?? spec.defaultValue);
          card.append(control.root);
        }
      }
      rackHost.append(card);
    });
  }

  function syncRack(row: EngineSnapshot['tracks'][number]): void {
    const inputs = rackHost.querySelectorAll('input[type="range"]');
    inputs.forEach((node) => {
      if (!(node instanceof HTMLInputElement) || document.activeElement === node) return;
      const slot = Number(node.dataset.slot);
      const id = node.dataset.param;
      const insert = row.inserts[slot];
      if (!insert || !id || insert.params[id] === undefined) return;
      node.value = String(insert.params[id]);
      readers.get(node)?.();
    });
  }

  function paint(frame: { reductions: readonly number[]; eq: readonly number[] | null }): void {
    const active = frame.reductions.reduce((max, value) => Math.max(max, value), 0);
    gr.textContent = active < 0.05 ? 'GR 0' : `GR ${active.toFixed(1)} dB`;
    drawCurve(curve, frame.eq);
  }

  return { element, render, paint };
}

function cardTitle(text: string): HTMLElement {
  const title = document.createElement('h3');
  title.textContent = text;
  return title;
}

function rowOf(...nodes: Node[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'device-row';
  row.append(...nodes);
  return row;
}

function range(
  label: string,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
  format: (value: number) => string = (value) => value.toFixed(2),
): { root: HTMLElement; input: HTMLInputElement; set: (value: number) => void } {
  const root = document.createElement('label');
  root.className = 'device-range';
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  const read = document.createElement('span');
  const paint = (): void => {
    read.textContent = format(Number(input.value));
  };
  input.addEventListener('input', () => {
    paint();
    onChange(Number(input.value));
  });
  readers.set(input, paint);
  root.append(name, input, read);
  return {
    root,
    input,
    set(value: number) {
      input.value = String(value);
      paint();
    },
  };
}

function autoPoint(
  canvas: HTMLCanvasElement,
  event: PointerEvent,
  lane: 'volume' | 'pan' | 'fx',
  snapshot: EngineSnapshot,
  track: number,
): { beat: number; value: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  const row = snapshot.tracks[track];
  const beats = Math.max(16, (row?.lengthBeats ?? 0) + (row?.startBeat ?? 0), ...((row?.volumeAuto ?? []).map((point) => point.beat)));
  const beat = Math.round(x * beats * 4) / 4;
  const scale = laneScale(lane, row);
  const value = scale.min + (1 - y) * (scale.max - scale.min);
  const stepped = lane === 'volume' || lane === 'pan' ? Math.round(value * 100) / 100 : value;
  return { beat, value: stepped };
}

function laneScale(
  lane: 'volume' | 'pan' | 'fx',
  row: EngineSnapshot['tracks'][number] | undefined,
): { min: number; max: number } {
  if (lane === 'pan') return { min: -1, max: 1 };
  if (lane === 'volume') return { min: -60, max: 6 };
  const insert = row?.inserts.find((item) => item && !item.bypass) ?? row?.inserts.find((item) => item) ?? null;
  if (!insert) return { min: 0, max: 1 };
  const info = pluginInfo(insert.kind);
  const spec = info.params.find((item) => item.id === info.autoParam);
  return spec ? { min: spec.min, max: spec.max } : { min: 0, max: 1 };
}

function drawAuto(canvas: HTMLCanvasElement, points: readonly AutoPoint[], min: number, max: number): void {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(2, Math.floor(rect.width || 240));
  const height = 64;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#10141a';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  if (points.length === 0) return;
  const beats = Math.max(16, ...points.map((point) => point.beat));
  const span = max - min || 1;
  const norm = (point: AutoPoint): number => (point.value - min) / span;
  ctx.strokeStyle = '#f0a202';
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = (point.beat / beats) * width;
    const y = height - Math.min(1, Math.max(0, norm(point))) * (height - 8) - 4;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = '#f4f7fb';
  for (const point of points) {
    const x = (point.beat / beats) * width;
    const y = height - Math.min(1, Math.max(0, norm(point))) * (height - 8) - 4;
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
}

function drawCurve(canvas: HTMLCanvasElement, eq: readonly number[] | null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#10141a';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  if (!eq || eq.length < 2) return;
  ctx.strokeStyle = '#3ecf8e';
  ctx.beginPath();
  eq.forEach((db, index) => {
    const x = (index / (eq.length - 1)) * width;
    const y = height / 2 - (db / 18) * (height / 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

const readers = new WeakMap<HTMLInputElement, () => void>();
