import type { SampleMeta } from '../audio/library';
import { formatLength } from '../audio/units';
import { PAD_KITS, chromaticBanks, parseSampleNote, resolveKit, type ChromaticBank, type KeyVoiceRequest } from '../audio/voices';

export interface LibraryHandlers {
  preview: (id: string) => void;
  load: (id: string) => void;
  trigger: (id: string, velocity?: number) => void;
  setKeyVoice: (voice: KeyVoiceRequest) => void;
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
const PERFORM_KEY = 'rs4-perform';
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
  playHint.textContent = 'Each pad plays its sample. Hold and drag across the pads or the keys to play each one you enter. Pick a kit or choose a one-shot per pad. The Voice menu switches the keys between the desk synth and sample banks. Higher on a pad or key is softer.';
  playHead.append(playTitle);
  const kitLabel = document.createElement('label');
  kitLabel.className = 'kit-pick';
  const kitName = document.createElement('span');
  kitName.textContent = 'Kit';
  const kitPick = document.createElement('select');
  kitPick.setAttribute('aria-label', 'Drum kit mapping');
  kitLabel.append(kitName, kitPick);
  const pads = document.createElement('div');
  pads.className = 'pads';
  const padRack = document.createElement('div');
  padRack.className = 'pad-rack';
  padRack.append(kitLabel, pads);
  const keys = document.createElement('div');
  keys.className = 'keys-wrap';
  const voiceLabel = document.createElement('label');
  voiceLabel.className = 'voice-pick';
  const voiceName = document.createElement('span');
  voiceName.textContent = 'Voice';
  const voicePick = document.createElement('select');
  voicePick.setAttribute('aria-label', 'Keyboard voice');
  voiceLabel.append(voiceName, voicePick);
  const keysLabel = document.createElement('p');
  keysLabel.className = 'group-label';
  keysLabel.textContent = 'Keys';
  const piano = document.createElement('div');
  piano.className = 'piano';
  keys.append(voiceLabel, piano);
  play.append(playHead, playHint, padRack, keysLabel, keys);

  const padButtons: HTMLButtonElement[] = [];
  const padPicks: HTMLSelectElement[] = [];
  const padIds: Array<string | null> = Array.from({ length: PAD_COUNT }, () => null);
  let banks: ChromaticBank[] = [];
  const keyButtons = new Map<number, HTMLButtonElement>();
  /** Pointer id → midi currently held by that pointer, or null while the press is between keys. */
  const glide = new Map<number, number | null>();
  /** Pointer id → pad index currently held, or null while the press is between pads. */
  const padGlide = new Map<number, number | null>();

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

  kitPick.addEventListener('change', () => {
    if (kitPick.value === 'custom') return;
    const kit = PAD_KITS.find((item) => item.id === kitPick.value);
    if (!kit) return;
    resolveKit(kit.pads, samples, PAD_COUNT).forEach((id, index) => assignPad(index, id, false));
    syncKitSelect();
    savePerform();
  });
  voicePick.addEventListener('change', () => {
    applyVoice();
    savePerform();
  });

  for (let index = 0; index < PAD_COUNT; index += 1) {
    const cell = document.createElement('div');
    cell.className = 'pad-cell';
    const pad = document.createElement('button');
    pad.type = 'button';
    pad.className = 'pad';
    pad.textContent = `Pad ${index + 1}`;
    pad.dataset.pad = String(index);
    const pick = document.createElement('select');
    pick.className = 'pad-pick';
    pick.setAttribute('aria-label', `Pad ${index + 1} sample`);
    bindPad(pad, index);
    pick.addEventListener('change', () => {
      if (!pick.value) return;
      assignPad(index, pick.value);
    });
    const takeDrop = (event: DragEvent): void => {
      event.preventDefault();
      pad.classList.remove('is-drop');
      const id = event.dataTransfer?.getData('application/x-rs-sample');
      if (!id) return;
      assignPad(index, id);
    };
    cell.addEventListener('dragover', (event) => {
      event.preventDefault();
      pad.classList.add('is-drop');
    });
    cell.addEventListener('dragleave', (event) => {
      if (event.relatedTarget instanceof Node && cell.contains(event.relatedTarget)) return;
      pad.classList.remove('is-drop');
    });
    cell.addEventListener('drop', takeDrop);
    cell.append(pad, pick);
    pads.append(cell);
    padButtons.push(pad);
    padPicks.push(pick);
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
    if (isTyping(event.target) || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
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

  function glideHolds(note: number): boolean {
    for (const current of glide.values()) {
      if (current === note) return true;
    }
    return false;
  }

  function keyUnder(x: number, y: number): { key: HTMLButtonElement; midi: number } | null {
    const hit = document.elementFromPoint(x, y);
    const button = hit instanceof Element ? hit.closest('.piano-white, .piano-black') : null;
    if (!(button instanceof HTMLButtonElement) || !piano.contains(button)) return null;
    const note = Number(button.dataset.midi);
    if (!Number.isFinite(note)) return null;
    return { key: button, midi: note };
  }

  /** Note-on when the held pointer enters a key, note-off when it leaves. */
  function setGlide(pointerId: number, midi: number | null, velocity: number): void {
    const previous = glide.has(pointerId) ? (glide.get(pointerId) ?? null) : null;
    if (glide.has(pointerId) && previous === midi) return;
    glide.set(pointerId, midi);
    if (previous !== null && !glideHolds(previous)) {
      keyButtons.get(previous)?.classList.remove('is-down');
      handlers.noteOff(previous);
    }
    if (midi !== null && [...glide.values()].filter((current) => current === midi).length === 1) {
      keyButtons.get(midi)?.classList.add('is-down');
      handlers.noteOn(midi, velocity);
    }
  }

  function endGlide(pointerId: number): void {
    if (!glide.has(pointerId)) return;
    const previous = glide.get(pointerId) ?? null;
    glide.delete(pointerId);
    if (previous !== null && !glideHolds(previous)) {
      keyButtons.get(previous)?.classList.remove('is-down');
      handlers.noteOff(previous);
    }
  }

  function padHeld(index: number): boolean {
    for (const current of padGlide.values()) {
      if (current === index) return true;
    }
    return false;
  }

  function padUnder(x: number, y: number): { pad: HTMLButtonElement; index: number } | null {
    const hit = document.elementFromPoint(x, y);
    const button = hit instanceof Element ? hit.closest('.pad') : null;
    if (!(button instanceof HTMLButtonElement) || !pads.contains(button)) return null;
    const index = Number(button.dataset.pad);
    if (!Number.isInteger(index) || index < 0 || index >= PAD_COUNT) return null;
    return { pad: button, index };
  }

  /** Fire a pad when the held pointer enters it. One-shots ring out; leaving does not retrigger. */
  function setPadGlide(pointerId: number, index: number | null, velocity: number): void {
    const previous = padGlide.has(pointerId) ? (padGlide.get(pointerId) ?? null) : null;
    if (padGlide.has(pointerId) && previous === index) return;
    padGlide.set(pointerId, index);
    if (previous !== null && !padHeld(previous)) padButtons[previous]?.classList.remove('is-down');
    if (index === null) return;
    padButtons[index]?.classList.add('is-down');
    const id = padIds[index];
    if (id) handlers.trigger(id, velocity);
  }

  function endPadGlide(pointerId: number): void {
    if (!padGlide.has(pointerId)) return;
    const previous = padGlide.get(pointerId) ?? null;
    padGlide.delete(pointerId);
    if (previous !== null && !padHeld(previous)) padButtons[previous]?.classList.remove('is-down');
  }

  function bindPad(pad: HTMLButtonElement, index: number): void {
    pad.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      try {
        pad.setPointerCapture(event.pointerId);
      } catch {
        /* The pointer can already be gone. */
      }
      setPadGlide(event.pointerId, index, velocityAt(event, pad));
    });
    pad.addEventListener('pointermove', (event) => {
      if (!padGlide.has(event.pointerId)) return;
      if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
        endPadGlide(event.pointerId);
        return;
      }
      const hit = padUnder(event.clientX, event.clientY);
      if (!hit) {
        setPadGlide(event.pointerId, null, 0);
        return;
      }
      setPadGlide(event.pointerId, hit.index, velocityAt(event, hit.pad));
    });
    const release = (event: PointerEvent): void => {
      endPadGlide(event.pointerId);
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
    pad.addEventListener('lostpointercapture', release);
  }

  function bindKey(key: HTMLButtonElement, midi: number): void {
    key.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      try {
        key.setPointerCapture(event.pointerId);
      } catch {
        /* The pointer can already be gone. */
      }
      setGlide(event.pointerId, midi, velocityAt(event, key));
    });
    key.addEventListener('pointermove', (event) => {
      if (!glide.has(event.pointerId)) return;
      if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
        endGlide(event.pointerId);
        return;
      }
      const hit = keyUnder(event.clientX, event.clientY);
      if (!hit) {
        setGlide(event.pointerId, null, 0);
        return;
      }
      setGlide(event.pointerId, hit.midi, velocityAt(event, hit.key));
    });
    const release = (event: PointerEvent): void => {
      endGlide(event.pointerId);
    };
    key.addEventListener('pointerup', release);
    key.addEventListener('pointercancel', release);
    key.addEventListener('lostpointercapture', release);
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
    chip.dataset.cat = sample.category;
    chip.classList.toggle('on', sample.id === selected);
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'sample-main';
    main.draggable = true;
    const length = typeof sample.seconds === 'number' ? formatLength(sample.seconds) : '';
    const tip = length ? `${sample.name} — ${length} — ${metaLine(sample)}` : `${sample.name} — ${metaLine(sample)}`;
    main.title = tip;
    main.setAttribute('aria-label', tip);
    const mark = document.createElement('span');
    mark.className = 'sample-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = tileMark(sample);
    const name = document.createElement('span');
    name.className = 'sample-name';
    name.textContent = sample.name;
    const duration = document.createElement('span');
    duration.className = 'sample-length';
    duration.textContent = length;
    main.append(mark, name);
    if (length) main.append(duration);
    main.addEventListener('click', () => {
      selected = sample.id;
      loadBtn.disabled = false;
      paintGrid();
      syncBrowserOption();
      if (voicePick.value === 'sample') {
        applyVoice();
        savePerform();
      }
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
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer?.setData('application/x-rs-sample', sample.id);
      event.dataTransfer?.setData('text/plain', sample.name);
    });
    chip.append(main, fav);
    return chip;
  }

  function assignPad(index: number, id: string, persist = true): void {
    const sample = samples.find((item) => item.id === id);
    if (!sample) return;
    padIds[index] = id;
    const pad = padButtons[index];
    if (pad) {
      pad.textContent = sample.name;
      pad.title = `Trigger ${sample.name}`;
    }
    const pick = padPicks[index];
    if (pick) {
      ensurePadOption(pick, sample);
      pick.value = id;
    }
    if (!persist) return;
    syncKitSelect();
    savePerform();
  }

  function setCatalog(next: SampleMeta[]): void {
    samples = next;
    banks = chromaticBanks(samples);
    limit = PAGE;
    const total = samples.length;
    creditCopy.textContent = `${total} sounds, CC0. Recorded drums are trimmed Virtuosity Drums excerpts performed by Austin McMahon at Virtuosity Musical Instruments, Boston, published by Versilian Studios. Loops marked recorded sequence those hits; percussion loops also layer original shaker and conga synthesis. Bass, keys, hand percussion, formant vocal chops, FX, ambience, electro drums, and shuffle, bass, and pad loops are original synthesis dedicated to CC0 for this console. Extra musical loops are CC0 pieces from OpenGameArt. Formant chops are not a recorded singer. See ATTRIBUTION.md for every file.`;
    paintCats();
    paintFilters();
    fillPadPicks();
    paintVoices();
    const memory = readPerform();
    if (memory.sampleId && samples.some((sample) => sample.id === memory.sampleId)) {
      selected = memory.sampleId;
      loadBtn.disabled = false;
    }
    const remembered = memory.pads.filter((id) => samples.some((sample) => sample.id === id));
    const acoustic = PAD_KITS[0];
    const initial = remembered.length === PAD_COUNT ? remembered : resolveKit(acoustic ? acoustic.pads : [], samples, PAD_COUNT);
    initial.forEach((id, index) => assignPad(index, id, false));
    syncKitSelect();
    syncBrowserOption();
    if (memory.voice && [...voicePick.options].some((option) => option.value === memory.voice)) voicePick.value = memory.voice;
    else voicePick.value = 'synth';
    applyVoice();
    paintGrid();
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

  function fillPadPicks(): void {
    const oneshots = samples.filter((sample) => sample.kind === 'oneshot');
    const groups = [...new Set(oneshots.map((sample) => sample.category))];
    for (const pick of padPicks) {
      pick.replaceChildren();
      for (const category of groups) {
        const group = document.createElement('optgroup');
        group.label = category;
        for (const sample of oneshots) {
          if (sample.category !== category) continue;
          group.append(option(sample.id, sample.name));
        }
        pick.append(group);
      }
    }
  }

  function ensurePadOption(pick: HTMLSelectElement, sample: SampleMeta): void {
    if ([...pick.options].some((item) => item.value === sample.id)) return;
    pick.append(option(sample.id, sample.name));
  }

  function paintKits(): void {
    const current = kitPick.value;
    kitPick.replaceChildren();
    kitPick.append(option('custom', 'Custom'));
    for (const kit of PAD_KITS) kitPick.append(option(kit.id, kit.name));
    if ([...kitPick.options].some((item) => item.value === current)) kitPick.value = current;
  }

  function paintVoices(): void {
    const current = voicePick.value;
    voicePick.replaceChildren();
    voicePick.append(option('synth', 'Desk synth'));
    for (const bank of banks) voicePick.append(option(`bank:${bank.id}`, bank.name));
    voicePick.append(option('sample', 'Browser sound'));
    if ([...voicePick.options].some((item) => item.value === current)) voicePick.value = current;
  }

  function syncBrowserOption(): void {
    const optionEl = [...voicePick.options].find((item) => item.value === 'sample');
    if (!optionEl) return;
    const sample = samples.find((item) => item.id === selected);
    optionEl.textContent = sample ? `Browser · ${sample.name}` : 'Browser sound';
  }

  function applyVoice(): void {
    const choice = voicePick.value;
    if (choice === 'synth') {
      handlers.setKeyVoice({ kind: 'synth' });
      return;
    }
    if (choice === 'sample') {
      const sample = samples.find((item) => item.id === selected);
      if (!sample) {
        handlers.setKeyVoice({ kind: 'synth' });
        return;
      }
      handlers.setKeyVoice({ kind: 'layers', layers: [{ id: sample.id, rootMidi: parseSampleNote(sample.id)?.rootMidi ?? 60 }] });
      return;
    }
    const bank = banks.find((item) => `bank:${item.id}` === choice);
    if (!bank) {
      handlers.setKeyVoice({ kind: 'synth' });
      return;
    }
    handlers.setKeyVoice({ kind: 'layers', layers: bank.layers });
  }

  function syncKitSelect(): void {
    const ids = padIds.map((id) => id ?? '');
    const match = PAD_KITS.find((kit) => kit.pads.length === ids.length && kit.pads.every((id, index) => id === ids[index]));
    kitPick.value = match ? match.id : 'custom';
  }

  function savePerform(): void {
    try {
      localStorage.setItem(
        PERFORM_KEY,
        JSON.stringify({
          pads: padIds.filter((id): id is string => Boolean(id)),
          voice: voicePick.value || 'synth',
          sampleId: selected || undefined,
        }),
      );
    } catch {
      // Private mode can reject storage; the rack still works until reload.
    }
  }

  function option(value: string, label: string): HTMLOptionElement {
    const item = document.createElement('option');
    item.value = value;
    item.textContent = label;
    return item;
  }

  paintCats();
  paintFilters();
  paintGrid();
  paintKits();
  paintVoices();
  setTarget(0);

  return { element, play, setCatalog, setTarget, fail };
}

function tileMark(sample: SampleMeta): string {
  const known: Record<string, string> = {
    Drums: 'DR',
    Perc: 'PC',
    Bass: 'BA',
    Keys: 'KY',
    Vocal: 'VO',
    FX: 'FX',
    Ambience: 'AM',
    Loops: 'LP',
  };
  return known[sample.category] ?? sample.category.slice(0, 2).toUpperCase();
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

function readPerform(): { pads: string[]; voice: string; sampleId: string } {
  try {
    const raw = localStorage.getItem(PERFORM_KEY);
    if (!raw) return { pads: [], voice: '', sampleId: '' };
    const parsed = JSON.parse(raw) as { pads?: unknown; voice?: unknown; sampleId?: unknown };
    return {
      pads: Array.isArray(parsed.pads) ? parsed.pads.filter((id): id is string => typeof id === 'string') : [],
      voice: typeof parsed.voice === 'string' ? parsed.voice : '',
      sampleId: typeof parsed.sampleId === 'string' ? parsed.sampleId : '',
    };
  } catch {
    return { pads: [], voice: '', sampleId: '' };
  }
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
