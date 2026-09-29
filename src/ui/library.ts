import type { SampleMeta } from '../audio/library';

export interface LibraryHandlers {
  preview: (id: string) => void;
  load: (id: string) => void;
  trigger: (id: string, velocity?: number) => void;
  noteOn: (midi: number, velocity?: number) => void;
  noteOff: (midi: number) => void;
}

export interface LibraryPanel {
  element: HTMLElement;
  play: HTMLElement;
  setCatalog: (samples: SampleMeta[]) => void;
  setTarget: (index: number) => void;
  fail: (message: string) => void;
}

const CATEGORY_ORDER = ['Drums', 'Perc', 'Bass', 'Keys', 'Vocal', 'FX', 'Ambience', 'Loops'];
const PAGE = 48;
const PAD_COUNT = 8;
const FAV_KEY = 'rs4-favs';
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
  title.textContent = 'Browser';
  const count = document.createElement('span');
  count.className = 'library-target';
  count.textContent = 'Loading…';
  heading.append(title, count);

  const targetLabel = document.createElement('p');
  targetLabel.className = 'note library-target-line';
  targetLabel.textContent = 'Place lands on track 1 at bar 1. Drag a sound onto a lane to pick the beat.';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'library-search';
  search.placeholder = 'Search sounds';
  search.setAttribute('aria-label', 'Search sounds');
  search.autocomplete = 'off';

  const categories = document.createElement('div');
  categories.className = 'library-cats';
  categories.setAttribute('role', 'toolbar');
  categories.setAttribute('aria-label', 'Sample categories');

  const filters = document.createElement('div');
  filters.className = 'library-filters';
  const kindFilters = document.createElement('div');
  kindFilters.className = 'library-cats';
  const bpmFilters = document.createElement('div');
  bpmFilters.className = 'library-cats bpm-filters';
  filters.append(kindFilters, bpmFilters);

  const grid = document.createElement('div');
  grid.className = 'sample-grid';
  const moreWrap = document.createElement('div');
  moreWrap.className = 'library-more';

  const actions = document.createElement('div');
  actions.className = 'library-actions';
  const loadBtn = document.createElement('button');
  loadBtn.type = 'button';
  loadBtn.className = 'btn small';
  loadBtn.textContent = 'Place on track 1';
  loadBtn.disabled = true;
  const favOnly = document.createElement('button');
  favOnly.type = 'button';
  favOnly.className = 'btn small';
  favOnly.textContent = 'Favorites';
  favOnly.setAttribute('aria-pressed', 'false');
  actions.append(loadBtn, favOnly);

  const credits = document.createElement('details');
  credits.className = 'credits';
  const summary = document.createElement('summary');
  summary.textContent = 'Sample credits';
  const creditCopy = document.createElement('p');
  creditCopy.textContent =
    'Recorded drums are trimmed Virtuosity Drums excerpts (CC0) performed by Austin McMahon at Virtuosity Musical Instruments, Boston, published by Versilian Studios. Loops marked recorded sequence those hits; percussion loops also layer original shaker and conga synthesis. Bass, keys, hand percussion, formant vocal chops, FX, ambience, the electro kit, and shuffle, bass, and pad loops are original synthesis dedicated to CC0 for this console. Vocal chops are not a recorded singer. Full file list: public/samples/ATTRIBUTION.md.';
  credits.append(summary, creditCopy);

  element.append(heading, targetLabel, search, categories, filters, actions, grid, moreWrap, credits);

  const play = document.createElement('section');
  play.className = 'panel perform';
  const playHead = document.createElement('div');
  playHead.className = 'library-head';
  const playTitle = document.createElement('h2');
  playTitle.textContent = 'Perform';
  const playHint = document.createElement('p');
  playHint.className = 'note';
  playHint.textContent = 'Drum rack: pads quantize to the beat while the transport is running. Higher on a pad or key is softer. Drop a sound on a pad to assign it. A–K plays the desk synth. Shift is a softer velocity.';
  playHead.append(playTitle);
  const pads = document.createElement('div');
  pads.className = 'pads';
  const keys = document.createElement('div');
  keys.className = 'keys-wrap';
  const keysLabel = document.createElement('p');
  keysLabel.className = 'group-label';
  keysLabel.textContent = 'Keys';
  const piano = document.createElement('div');
  piano.className = 'piano';
  keys.append(piano);
  play.append(playHead, playHint, pads, keysLabel, keys);

  const padButtons: HTMLButtonElement[] = [];
  const padIds: Array<string | null> = Array.from({ length: PAD_COUNT }, () => null);
  const keyButtons = new Map<number, HTMLButtonElement>();

  let samples: SampleMeta[] = [];
  let category = 'All';
  let kind: 'all' | 'oneshot' | 'loop' = 'all';
  let bpm: number | null = null;
  let query = '';
  let selected = '';
  let target = 0;
  let limit = PAGE;
  let favoritesOnly = false;
  const favorites = new Set<string>(readFavs());

  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    limit = PAGE;
    paintGrid();
  });
  loadBtn.addEventListener('click', () => {
    if (selected) handlers.load(selected);
  });
  favOnly.addEventListener('click', () => {
    favoritesOnly = !favoritesOnly;
    favOnly.classList.toggle('on', favoritesOnly);
    favOnly.setAttribute('aria-pressed', String(favoritesOnly));
    limit = PAGE;
    paintGrid();
  });

  for (let index = 0; index < PAD_COUNT; index += 1) {
    const pad = document.createElement('button');
    pad.type = 'button';
    pad.className = 'pad';
    pad.textContent = `Pad ${index + 1}`;
    pad.addEventListener('pointerdown', (event) => {
      const id = padIds[index];
      if (!id) return;
      handlers.trigger(id, velocityAt(event, pad));
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
    key.setAttribute('aria-label', `Note ${midi}`);
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
    key.setAttribute('aria-label', `Note ${black.midi}`);
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
    handlers.noteOn(midi, event.shiftKey ? 0.4 : 0.92);
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
      handlers.noteOn(midi, velocityAt(event, key));
    });
    const release = (): void => {
      key.classList.remove('is-down');
      handlers.noteOff(midi);
    };
    key.addEventListener('pointerup', release);
    key.addEventListener('pointercancel', release);
  }

  function visible(): SampleMeta[] {
    return samples.filter((sample) => {
      if (favoritesOnly && !favorites.has(sample.id)) return false;
      if (category !== 'All' && sample.category !== category) return false;
      if (kind === 'oneshot' && sample.kind !== 'oneshot') return false;
      if (kind === 'loop' && sample.kind !== 'loop') return false;
      if (bpm !== null && sample.bpm !== bpm) return false;
      if (!query) return true;
      const hay = `${sample.name} ${sample.category} ${sample.id} ${sample.bpm ?? ''}`.toLowerCase();
      return hay.includes(query);
    });
  }

  function paintCats(): void {
    categories.replaceChildren();
    const present = new Set(samples.map((sample) => sample.category));
    const names = ['All', ...CATEGORY_ORDER.filter((name) => present.has(name))];
    for (const extra of present) {
      if (!names.includes(extra)) names.push(extra);
    }
    if (!names.includes(category)) category = 'All';
    for (const name of names) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn tiny';
      const amount = name === 'All' ? samples.length : samples.filter((sample) => sample.category === name).length;
      button.textContent = `${name} ${amount}`;
      button.setAttribute('aria-pressed', String(name === category));
      button.classList.toggle('on', name === category);
      button.addEventListener('click', () => {
        category = name;
        bpm = null;
        limit = PAGE;
        paintCats();
        paintFilters();
        paintGrid();
      });
      categories.append(button);
    }
  }

  function paintFilters(): void {
    kindFilters.replaceChildren();
    bpmFilters.replaceChildren();
    const kinds: Array<['all' | 'oneshot' | 'loop', string]> = [
      ['all', 'All'],
      ['oneshot', 'Hits'],
      ['loop', 'Loops'],
    ];
    for (const [value, label] of kinds) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn tiny';
      button.textContent = label;
      button.classList.toggle('on', kind === value);
      button.setAttribute('aria-pressed', String(kind === value));
      button.addEventListener('click', () => {
        kind = value;
        limit = PAGE;
        paintFilters();
        paintGrid();
      });
      kindFilters.append(button);
    }
    const tempos = [...new Set(samples.map((sample) => sample.bpm).filter((value): value is number => typeof value === 'number'))].sort(
      (a, b) => a - b,
    );
    if (tempos.length === 0) return;
    const allBpm = document.createElement('button');
    allBpm.type = 'button';
    allBpm.className = 'btn tiny';
    allBpm.textContent = 'Any BPM';
    allBpm.classList.toggle('on', bpm === null);
    allBpm.setAttribute('aria-pressed', String(bpm === null));
    allBpm.addEventListener('click', () => {
      bpm = null;
      limit = PAGE;
      paintFilters();
      paintGrid();
    });
    bpmFilters.append(allBpm);
    for (const tempo of tempos) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn tiny';
      button.textContent = String(tempo);
      button.classList.toggle('on', bpm === tempo);
      button.setAttribute('aria-pressed', String(bpm === tempo));
      button.addEventListener('click', () => {
        bpm = tempo;
        kind = 'loop';
        limit = PAGE;
        paintFilters();
        paintGrid();
      });
      bpmFilters.append(button);
    }
  }

  function paintGrid(): void {
    grid.replaceChildren();
    moreWrap.replaceChildren();
    const matches = visible();
    count.textContent = samples.length ? `${samples.length} sounds` : 'No library';
    if (samples.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'note';
      empty.textContent = 'Loading the session kit…';
      grid.append(empty);
      return;
    }
    if (matches.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'note';
      empty.textContent = 'Nothing matches that filter.';
      grid.append(empty);
      return;
    }
    const slice = matches.slice(0, limit);
    const fragment = document.createDocumentFragment();
    for (const sample of slice) {
      fragment.append(renderChip(sample));
    }
    grid.append(fragment);
    const shown = document.createElement('p');
    shown.className = 'note';
    shown.textContent = matches.length > slice.length ? `Showing ${slice.length} of ${matches.length}` : `${matches.length} shown`;
    moreWrap.append(shown);
    if (matches.length > slice.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn small';
      more.textContent = 'Show more';
      more.addEventListener('click', () => {
        limit += PAGE;
        paintGrid();
      });
      moreWrap.append(more);
    }
  }

  function renderChip(sample: SampleMeta): HTMLElement {
    const chip = document.createElement('div');
    chip.className = 'sample-chip';
    chip.classList.toggle('on', sample.id === selected);
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'sample-main';
    main.draggable = true;
    const name = document.createElement('span');
    name.className = 'sample-name';
    name.textContent = sample.name;
    const meta = document.createElement('span');
    meta.className = 'sample-meta';
    meta.textContent = metaLine(sample);
    main.append(name, meta);
    main.addEventListener('click', () => {
      selected = sample.id;
      loadBtn.disabled = false;
      paintGrid();
      handlers.preview(sample.id);
    });
    main.addEventListener('dblclick', () => handlers.load(sample.id));
    const fav = document.createElement('button');
    fav.type = 'button';
    fav.className = 'fav';
    const marked = favorites.has(sample.id);
    fav.textContent = marked ? '★' : '☆';
    fav.classList.toggle('on', marked);
    fav.setAttribute('aria-pressed', String(marked));
    fav.setAttribute('aria-label', marked ? `Unfavorite ${sample.name}` : `Favorite ${sample.name}`);
    fav.addEventListener('click', (event) => {
      event.stopPropagation();
      if (favorites.has(sample.id)) favorites.delete(sample.id);
      else favorites.add(sample.id);
      writeFavs(favorites);
      paintGrid();
    });
    main.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('application/x-rs-sample', sample.id);
      event.dataTransfer?.setData('text/plain', sample.name);
    });
    chip.append(main, fav);
    return chip;
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
    limit = PAGE;
    const total = samples.length;
    creditCopy.textContent = `${total} sounds, CC0. Recorded drums are trimmed Virtuosity Drums excerpts performed by Austin McMahon at Virtuosity Musical Instruments, Boston, published by Versilian Studios. Loops marked recorded sequence those hits; percussion loops also layer original shaker and conga synthesis. Bass, keys, hand percussion, formant vocal chops, FX, ambience, electro drums, and shuffle, bass, and pad loops are original synthesis dedicated to CC0 for this console. Formant chops are not a recorded singer. See ATTRIBUTION.md for every file.`;
    paintCats();
    paintFilters();
    paintGrid();
    const defaults = ['kick', 'snare', 'hat', 'stick', 'tom-lo', 'bass-c', 'key-c', 'shaker'];
    defaults.forEach((id, index) => {
      if (samples.some((sample) => sample.id === id)) assignPad(index, id);
    });
  }

  function setTarget(index: number): void {
    target = index;
    const label = target < 4 ? `Audio ${target + 1}` : `Inst ${target + 1}`;
    targetLabel.textContent = `Place lands on ${label} at bar 1. Drag a sound onto a lane to pick the beat.`;
    loadBtn.textContent = `Place on ${label}`;
  }

  function fail(message: string): void {
    grid.replaceChildren();
    moreWrap.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'note';
    empty.textContent = message;
    grid.append(empty);
    count.textContent = 'Library unavailable';
  }

  paintCats();
  paintFilters();
  paintGrid();
  setTarget(0);

  return { element, play, setCatalog, setTarget, fail };
}

function metaLine(sample: SampleMeta): string {
  const bits: string[] = [];
  if (sample.kind === 'loop') {
    bits.push(sample.bars ? `${sample.bars} bar${sample.bars === 1 ? '' : 's'}` : 'Loop');
    if (sample.bpm) bits.push(`${sample.bpm} BPM`);
  } else {
    bits.push('One-shot');
  }
  if (sample.credit === 'virtuosity') bits.push('recorded');
  else if (sample.credit === 'original') bits.push('synth');
  return bits.join(' · ');
}

function readFavs(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeFavs(values: Set<string>): void {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...values]));
  } catch {
    // Private mode can reject storage; favorites still work until reload.
  }
}

function velocityAt(event: PointerEvent, el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  if (rect.height < 2) return 0.85;
  const along = (event.clientY - rect.top) / rect.height;
  return Math.min(1, Math.max(0.15, along));
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}
