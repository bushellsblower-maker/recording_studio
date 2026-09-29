import type { SampleMeta } from '../audio/library';

export interface LibraryHandlers {
  preview: (id: string) => void;
  load: (id: string) => void;
  trigger: (id: string) => void;
  noteOn: (midi: number) => void;
  noteOff: (midi: number) => void;
}

export interface LibraryPanel {
  element: HTMLElement;
  setCatalog: (samples: SampleMeta[]) => void;
  setTarget: (index: number) => void;
  fail: (message: string) => void;
}

const CATEGORIES = ['Drums', 'Bass', 'Keys', 'Perc', 'FX'];
const PAD_COUNT = 8;
const WHITE_NOTES = [60, 62, 64, 65, 67, 69, 71, 72];
const BLACK_NOTES: Array<{ midi: number; left: string }> = [
  { midi: 61, left: '12.5%' },
  { midi: 63, left: '25%' },
  { midi: 66, left: '50%' },
  { midi: 68, left: '62.5%' },
  { midi: 70, left: '75%' },
];
const KEYBOARD: Record<string, number> = {
  KeyA: 60,
  KeyW: 61,
  KeyS: 62,
  KeyE: 63,
  KeyD: 64,
  KeyF: 65,
  KeyT: 66,
  KeyG: 67,
  KeyY: 68,
  KeyH: 69,
  KeyU: 70,
  KeyJ: 71,
  KeyK: 72,
};

export function buildLibrary(handlers: LibraryHandlers): LibraryPanel {
  const element = document.createElement('section');
  element.className = 'panel library';

  const heading = document.createElement('div');
  heading.className = 'library-head';
  const title = document.createElement('h2');
  title.textContent = 'Sample library';
  const targetLabel = document.createElement('span');
  targetLabel.className = 'library-target';
  targetLabel.textContent = 'Load target: track 1';
  heading.append(title, targetLabel);

  const categories = document.createElement('div');
  categories.className = 'library-cats';
  const grid = document.createElement('div');
  grid.className = 'sample-grid';
  const actions = document.createElement('div');
  actions.className = 'library-actions';
  const loadBtn = document.createElement('button');
  loadBtn.type = 'button';
  loadBtn.className = 'btn small';
  loadBtn.textContent = 'Load on track';
  loadBtn.disabled = true;
  actions.append(loadBtn);

  const pads = document.createElement('div');
  pads.className = 'pads';
  const padButtons: HTMLButtonElement[] = [];
  const padIds: Array<string | null> = Array.from({ length: PAD_COUNT }, () => null);

  const keys = document.createElement('div');
  keys.className = 'keys-wrap';
  const keysLabel = document.createElement('p');
  keysLabel.className = 'group-label';
  keysLabel.textContent = 'Keys';
  const piano = document.createElement('div');
  piano.className = 'piano';
  const keyButtons = new Map<number, HTMLButtonElement>();

  const credits = document.createElement('details');
  credits.className = 'credits';
  const summary = document.createElement('summary');
  summary.textContent = 'Sample credits';
  const creditCopy = document.createElement('p');
  creditCopy.textContent =
    'Virtuosity Drums excerpts (CC0) performed by Austin McMahon at Virtuosity Musical Instruments, Boston, published by Versilian Studios. House, half-time, and percussion loops sequence those hits. Bass, keys, shaker, rise, and wash are original synthesis dedicated to CC0 for this console. Loops are 100 BPM and follow the click.';
  credits.append(summary, creditCopy);

  const note = document.createElement('p');
  note.className = 'note';
  note.textContent =
    'Click a sample to preview it. Drag it onto a track or a pad. Pads quantize to the beat while the transport is running. A–K plays the keyboard.';

  element.append(heading, categories, grid, actions, pads, keysLabel, keys, note, credits);
  keys.append(piano);

  let samples: SampleMeta[] = [];
  let category = 'Drums';
  let selected = '';
  let target = 0;
  const catButtons = new Map<string, HTMLButtonElement>();

  for (const name of CATEGORIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn tiny';
    button.textContent = name;
    button.addEventListener('click', () => {
      category = name;
      paintCats();
      paintGrid();
    });
    categories.append(button);
    catButtons.set(name, button);
  }

  loadBtn.addEventListener('click', () => {
    if (selected) handlers.load(selected);
  });

  for (let index = 0; index < PAD_COUNT; index += 1) {
    const pad = document.createElement('button');
    pad.type = 'button';
    pad.className = 'pad';
    pad.textContent = `Pad ${index + 1}`;
    pad.addEventListener('click', () => {
      const id = padIds[index];
      if (id) handlers.trigger(id);
    });
    pad.addEventListener('dragover', (event) => {
      event.preventDefault();
      pad.classList.add('is-drop');
    });
    pad.addEventListener('dragleave', () => pad.classList.remove('is-drop'));
    pad.addEventListener('drop', (event) => {
      event.preventDefault();
      pad.classList.remove('is-drop');
      const id = event.dataTransfer?.getData('application/x-rs-sample');
      if (!id) return;
      assignPad(index, id);
    });
    pads.append(pad);
    padButtons.push(pad);
  }

  for (const midi of WHITE_NOTES) {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'piano-white';
    key.textContent = midi === 60 || midi === 72 ? 'C' : '';
    key.dataset.midi = String(midi);
    bindKey(key, midi);
    piano.append(key);
    keyButtons.set(midi, key);
  }
  for (const black of BLACK_NOTES) {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'piano-black';
    key.style.left = black.left;
    key.dataset.midi = String(black.midi);
    bindKey(key, black.midi);
    piano.append(key);
    keyButtons.set(black.midi, key);
  }

  window.addEventListener('keydown', (event) => {
    if (isTyping(event.target) || event.repeat) return;
    const midi = KEYBOARD[event.code];
    if (!midi) return;
    event.preventDefault();
    keyButtons.get(midi)?.classList.add('is-down');
    handlers.noteOn(midi);
  });
  window.addEventListener('keyup', (event) => {
    const midi = KEYBOARD[event.code];
    if (!midi) return;
    keyButtons.get(midi)?.classList.remove('is-down');
    handlers.noteOff(midi);
  });

  function bindKey(key: HTMLButtonElement, midi: number): void {
    key.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      key.setPointerCapture(event.pointerId);
      key.classList.add('is-down');
      handlers.noteOn(midi);
    });
    const release = (): void => {
      key.classList.remove('is-down');
      handlers.noteOff(midi);
    };
    key.addEventListener('pointerup', release);
    key.addEventListener('pointercancel', release);
  }

  function paintCats(): void {
    for (const [name, button] of catButtons) {
      const on = name === category;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    }
  }

  function paintGrid(): void {
    grid.replaceChildren();
    const visible = samples.filter((sample) => sample.category === category);
    if (samples.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'note';
      empty.textContent = 'Loading the session kit…';
      grid.append(empty);
      return;
    }
    if (visible.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'note';
      empty.textContent = 'Nothing in this category.';
      grid.append(empty);
      return;
    }
    for (const sample of visible) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sample-chip';
      chip.draggable = true;
      chip.classList.toggle('on', sample.id === selected);
      const name = document.createElement('span');
      name.className = 'sample-name';
      name.textContent = sample.name;
      const meta = document.createElement('span');
      meta.className = 'sample-meta';
      meta.textContent = sample.kind === 'loop' && sample.bpm ? `${sample.bars ?? 2} bars · ${sample.bpm} BPM` : 'One-shot';
      chip.append(name, meta);
      chip.addEventListener('click', () => {
        selected = sample.id;
        loadBtn.disabled = false;
        paintGrid();
        handlers.preview(sample.id);
      });
      chip.addEventListener('dblclick', () => handlers.load(sample.id));
      chip.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('application/x-rs-sample', sample.id);
        event.dataTransfer?.setData('text/plain', sample.name);
      });
      grid.append(chip);
    }
  }

  function assignPad(index: number, id: string): void {
    const sample = samples.find((item) => item.id === id);
    if (!sample) return;
    padIds[index] = id;
    const pad = padButtons[index];
    if (!pad) return;
    pad.textContent = sample.name;
    pad.title = `Trigger ${sample.name}`;
  }

  function setCatalog(next: SampleMeta[]): void {
    samples = next;
    if (!samples.some((sample) => sample.category === category) && samples[0]) {
      category = samples[0].category;
    }
    paintCats();
    paintGrid();
    const defaults = ['kick', 'snare', 'hat', 'stick', 'tom-lo', 'bass-c', 'key-c', 'shaker'];
    defaults.forEach((id, index) => {
      if (samples.some((sample) => sample.id === id)) assignPad(index, id);
    });
  }

  function setTarget(index: number): void {
    target = index;
    targetLabel.textContent = `Load target: track ${target + 1}`;
    loadBtn.textContent = `Load on track ${target + 1}`;
  }

  function fail(message: string): void {
    grid.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'note';
    empty.textContent = message;
    grid.append(empty);
  }

  paintCats();
  paintGrid();
  setTarget(0);

  return { element, setCatalog, setTarget, fail };
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}
