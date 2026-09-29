/** Desktop desk: two columns of sections, with visible splitters and drag grips.
 *  Each open section keeps a full working height. The stack can run past the window,
 *  and the document scrollbar moves the whole desk. Section shells do not scroll.
 */

const STORAGE_KEY = 'rs4-desk-layout';
const DESKTOP_QUERY = '(min-width: 900px)';
const DEFAULT_SPLIT = 0.22;
const MIN_SPLIT = 0.16;
const MAX_SPLIT = 0.52;
const MIN_PANE_PX = 72;
const MIN_COLUMN_PX = 180;

export const DESK_ZONES = ['browse', 'arrange', 'devices', 'console', 'play'] as const;
export type DeskZoneId = (typeof DESK_ZONES)[number];

const ZONE_LABEL: Record<DeskZoneId, string> = {
  browse: 'Browser',
  arrange: 'Arrangement',
  devices: 'Devices',
  console: 'Console',
  play: 'Pads and keys',
};

const DEFAULT_SIZE: Record<DeskZoneId, number> = {
  browse: 1,
  arrange: 1.5,
  devices: 1.15,
  console: 1.05,
  play: 0.72,
};

/** Full working height for a section. The stack of these is taller than a window, so the page can scroll. */
const NATURAL_FLOOR: Record<DeskZoneId, number> = {
  browse: 560,
  arrange: 520,
  devices: 480,
  console: 420,
  play: 280,
};

export interface DeskLayoutState {
  version: 1;
  columns: [DeskZoneId[], DeskZoneId[]];
  /** Left column share of the desk width. */
  split: number;
  size: Record<DeskZoneId, number>;
}

interface DropAt {
  column: 0 | 1;
  before: DeskZoneId | null;
}

export function defaultLayout(): DeskLayoutState {
  return {
    version: 1,
    columns: [['browse'], ['arrange', 'devices', 'console', 'play']],
    split: DEFAULT_SPLIT,
    size: { ...DEFAULT_SIZE },
  };
}

function isZone(value: unknown): value is DeskZoneId {
  return typeof value === 'string' && (DESK_ZONES as readonly string[]).includes(value);
}

export function normalizeLayout(input: unknown): DeskLayoutState {
  const fallback = defaultLayout();
  if (!input || typeof input !== 'object') return fallback;
  const value = input as { version?: unknown; columns?: unknown; split?: unknown; size?: unknown };
  if (value.version !== 1 || !Array.isArray(value.columns) || value.columns.length !== 2) return fallback;

  const seen = new Set<DeskZoneId>();
  const columns: [DeskZoneId[], DeskZoneId[]] = [[], []];
  for (let index = 0; index < 2; index += 1) {
    const column = value.columns[index];
    if (!Array.isArray(column)) continue;
    for (const id of column) {
      if (!isZone(id) || seen.has(id)) continue;
      seen.add(id);
      columns[index].push(id);
    }
  }
  for (const id of DESK_ZONES) {
    if (!seen.has(id)) columns[1].push(id);
  }

  const size = { ...DEFAULT_SIZE };
  if (value.size && typeof value.size === 'object') {
    for (const id of DESK_ZONES) {
      const next = (value.size as Record<string, unknown>)[id];
      if (typeof next === 'number' && Number.isFinite(next) && next > 0) {
        size[id] = Math.min(8, Math.max(0.15, next));
      }
    }
  }

  const split =
    typeof value.split === 'number' && Number.isFinite(value.split)
      ? clamp(value.split, MIN_SPLIT, MAX_SPLIT)
      : DEFAULT_SPLIT;

  return { version: 1, columns, split, size };
}

export function loadLayout(): DeskLayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLayout();
    return normalizeLayout(JSON.parse(raw) as unknown);
  } catch {
    return defaultLayout();
  }
}

export function saveLayout(state: DeskLayoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode and quota errors leave the in-memory layout in place.
  }
}

export function attachDeskLayout(
  desk: HTMLElement,
  zones: Record<DeskZoneId, HTMLElement>,
  heads: Record<DeskZoneId, HTMLElement>,
  shortcutSummary: HTMLElement,
): { reset: () => void } {
  const mq = window.matchMedia(DESKTOP_QUERY);
  let state = loadLayout();
  let dragId: DeskZoneId | null = null;
  let drop: DropAt | null = null;
  let renderGen = 0;
  let chromeObserver: ResizeObserver | null = null;
  let measuredWidth = -1;
  let applying = false;
  const naturals = new Map<DeskZoneId, number>();
  const indicator = document.createElement('div');
  indicator.className = 'desk-drop';
  indicator.hidden = true;

  window.addEventListener('resize', () => {
    if (mq.matches) applyMetrics();
  });

  for (const id of DESK_ZONES) {
    zones[id].dataset.deskZone = id;
    heads[id].prepend(makeGrip(id));
  }
  shortcutSummary.append(makeReset());

  const collapseObserver = new MutationObserver((records) => {
    if (!mq.matches) return;
    const collapsed = records.some((record) => {
      const el = record.target;
      if (!(el instanceof HTMLElement)) return false;
      const was = record.oldValue?.split(/\s+/).includes('is-collapsed') ?? false;
      return el.classList.contains('is-collapsed') !== was;
    });
    if (!collapsed) return;
    applyMetrics();
  });
  for (const id of DESK_ZONES) {
    const host =
      id === 'browse' ? zones.browse.querySelector('.library') : id === 'play' ? zones.play.querySelector('.perform') : zones[id];
    if (host) collapseObserver.observe(host, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  }

  mq.addEventListener('change', () => {
    cancelDrag();
    render();
  });
  render();

  return {
    reset() {
      state = defaultLayout();
      saveLayout(state);
      render();
    },
  };

  function makeReset(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn tiny layout-reset';
    button.textContent = 'Reset layout';
    button.title = 'Restore the original section sizes and order';
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      state = defaultLayout();
      saveLayout(state);
      render();
    });
    return button;
  }

  function makeGrip(id: DeskZoneId): HTMLElement {
    const grip = document.createElement('span');
    grip.className = 'desk-grip';
    grip.tabIndex = 0;
    grip.role = 'button';
    grip.title = `Drag ${ZONE_LABEL[id]} to another slot. Arrow keys move it.`;
    grip.setAttribute('aria-label', grip.title);
    grip.setAttribute('aria-grabbed', 'false');
    grip.addEventListener('pointerdown', (event) => onGripDown(event, id, grip));
    grip.addEventListener('keydown', (event) => onGripKey(event, id, grip));
    return grip;
  }

  function render(): void {
    renderGen += 1;
    const desktop = mq.matches;
    desk.classList.toggle('is-desktop-layout', desktop);
    if (!desktop) {
      desk.style.minHeight = '';
      desk.style.height = '';
      desk.style.maxHeight = '';
      naturals.clear();
      for (const id of DESK_ZONES) {
        zones[id].classList.remove('desk-pane', 'is-dragging');
        clearPaneBox(zones[id]);
      }
      desk.replaceChildren(zones.browse, zones.arrange, zones.devices, zones.console, zones.play);
      return;
    }

    const columns = [0, 1].map((index) => {
      const column = document.createElement('div');
      column.className = 'desk-col';
      column.dataset.col = String(index);
      const ids = state.columns[index as 0 | 1];
      if (ids.length === 0) {
        column.classList.add('is-empty');
        const hint = document.createElement('span');
        hint.className = 'desk-drop-hint';
        hint.textContent = 'Drop';
        column.append(hint);
        return column;
      }
      ids.forEach((id, paneIndex) => {
        if (paneIndex > 0) column.append(makeRowSplit(ids[paneIndex - 1]!, id));
        const pane = zones[id];
        pane.classList.add('desk-pane');
        column.append(pane);
      });
      column.append(makeEndSplit(ids[ids.length - 1]!));
      return column;
    });

    const split = makeColSplit();
    const leftEmpty = state.columns[0].length === 0;
    const rightEmpty = state.columns[1].length === 0;
    if (leftEmpty || rightEmpty) split.classList.add('is-locked');
    desk.replaceChildren(columns[0]!, split, columns[1]!, indicator);
    applyMetrics();
    const gen = renderGen;
    requestAnimationFrame(() => {
      if (gen !== renderGen || !mq.matches) return;
      ensureChromeWatch();
      applyMetrics();
    });
  }

  function applyMetrics(): void {
    if (!mq.matches || applying) return;
    applying = true;
    try {
      applyMetricsNow();
    } finally {
      applying = false;
    }
  }

  function applyMetricsNow(): void {
    const left = desk.querySelector<HTMLElement>('.desk-col[data-col="0"]');
    const right = desk.querySelector<HTMLElement>('.desk-col[data-col="1"]');
    const split = desk.querySelector<HTMLElement>('.desk-split');
    const leftEmpty = state.columns[0].length === 0;
    const rightEmpty = state.columns[1].length === 0;
    const dragging = desk.classList.contains('is-dragging');
    if (left && right) {
      if (leftEmpty) {
        left.style.flex = dragging ? '0 0 72px' : '0 0 0px';
        right.style.flex = '1 1 auto';
      } else if (rightEmpty) {
        right.style.flex = dragging ? '0 0 72px' : '0 0 0px';
        left.style.flex = '1 1 auto';
      } else {
        left.style.flex = `0 0 calc((100% - 8px) * ${state.split})`;
        right.style.flex = '1 1 auto';
      }
    }
    if (split && (leftEmpty || rightEmpty)) split.style.flexBasis = dragging ? '8px' : '0px';
    const budget = measureBudget();
    if (budget == null) return;
    const width = Math.round(desk.clientWidth);
    if (Math.abs(width - measuredWidth) > 2) {
      naturals.clear();
      measuredWidth = width;
    }
    desk.style.height = 'auto';
    desk.style.maxHeight = 'none';
    desk.style.minHeight = `${budget}px`;
    layoutColumn(0);
    layoutColumn(1);
  }

  function ensureChromeWatch(): void {
    const app = desk.parentElement;
    if (!app || chromeObserver) return;
    chromeObserver = new ResizeObserver(() => {
      if (mq.matches) applyMetrics();
    });
    for (const child of app.children) {
      if (child !== desk && child instanceof HTMLElement) chromeObserver.observe(child);
    }
  }

  /** Viewport height left after the header, transport, status line, and footer. */
  function measureBudget(): number | null {
    const app = desk.parentElement;
    if (!app?.isConnected) return null;
    const style = getComputedStyle(app);
    const pad = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const gap = parseFloat(style.rowGap) || parseFloat(style.gap) || 0;
    let chrome = pad;
    let siblings = 0;
    for (const child of app.children) {
      if (!(child instanceof HTMLElement) || child === desk) continue;
      if (child.offsetHeight <= 0) continue;
      chrome += child.offsetHeight;
      siblings += 1;
    }
    chrome += gap * siblings;
    return Math.max(280, Math.round(window.innerHeight - chrome));
  }

  function naturalHeight(id: DeskZoneId): number {
    const cached = naturals.get(id);
    if (cached) return cached;
    const pane = zones[id];
    const previous = {
      height: pane.style.height,
      minHeight: pane.style.minHeight,
      maxHeight: pane.style.maxHeight,
      flex: pane.style.flex,
      overflow: pane.style.overflow,
    };
    pane.classList.add('is-natural');
    pane.style.height = 'auto';
    pane.style.minHeight = '0';
    pane.style.maxHeight = 'none';
    pane.style.flex = '0 0 auto';
    pane.style.overflow = 'visible';
    const measured = pane.offsetHeight;
    pane.classList.remove('is-natural');
    pane.style.height = previous.height;
    pane.style.minHeight = previous.minHeight;
    pane.style.maxHeight = previous.maxHeight;
    pane.style.flex = previous.flex;
    pane.style.overflow = previous.overflow;
    const height = clamp(Math.max(measured, NATURAL_FLOOR[id]), MIN_PANE_PX, 1400);
    naturals.set(id, height);
    return height;
  }

  function heightFor(id: DeskZoneId): number {
    const scale = state.size[id] / DEFAULT_SIZE[id];
    return Math.max(MIN_PANE_PX, Math.round(naturalHeight(id) * scale));
  }

  function sizeForHeight(id: DeskZoneId, px: number): number {
    const base = Math.max(1, naturalHeight(id));
    return clamp((px / base) * DEFAULT_SIZE[id], 0.15, 8);
  }

  function layoutColumn(index: 0 | 1): void {
    const column = desk.querySelector<HTMLElement>(`.desk-col[data-col="${index}"]`);
    const ids = state.columns[index];
    if (!column || ids.length === 0) return;

    for (const id of ids) {
      const pane = zones[id];
      if (!pane.classList.contains('desk-pane')) continue;
      pane.style.flex = '0 0 auto';
      pane.style.maxHeight = 'none';
      if (isCollapsed(id)) {
        pane.style.height = 'auto';
        pane.style.minHeight = '0';
        continue;
      }
      pane.style.height = `${heightFor(id)}px`;
      pane.style.minHeight = '0';
    }
  }

  function isCollapsed(id: DeskZoneId): boolean {
    if (id === 'browse') return Boolean(zones.browse.querySelector('.library')?.classList.contains('is-collapsed'));
    if (id === 'play') return Boolean(zones.play.querySelector('.perform')?.classList.contains('is-collapsed'));
    return zones[id].classList.contains('is-collapsed');
  }

  function makeColSplit(): HTMLElement {
    const split = document.createElement('div');
    split.className = 'desk-split';
    split.role = 'separator';
    split.tabIndex = 0;
    split.ariaOrientation = 'vertical';
    split.title = 'Drag to resize the columns. Double-click to reset the width.';
    split.setAttribute('aria-label', 'Resize browser and stack columns');
    split.addEventListener('pointerdown', (event) => onColDown(event, split));
    split.addEventListener('dblclick', () => {
      state.split = DEFAULT_SPLIT;
      applyMetrics();
      saveLayout(state);
    });
    split.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!mq.matches) return;
      const step = event.shiftKey ? 0.04 : 0.02;
      if (event.key === 'ArrowLeft') state.split = clamp(state.split - step, MIN_SPLIT, MAX_SPLIT);
      else if (event.key === 'ArrowRight') state.split = clamp(state.split + step, MIN_SPLIT, MAX_SPLIT);
      else return;
      event.preventDefault();
      applyMetrics();
      saveLayout(state);
    });
    return split;
  }

  function makeRowSplit(above: DeskZoneId, below: DeskZoneId): HTMLElement {
    const split = document.createElement('div');
    split.className = 'pane-split';
    split.role = 'separator';
    split.tabIndex = 0;
    split.ariaOrientation = 'horizontal';
    split.title = `Drag to resize ${ZONE_LABEL[above]} and ${ZONE_LABEL[below]}. Double-click to reset.`;
    split.setAttribute('aria-label', split.title);
    split.addEventListener('pointerdown', (event) => onRowDown(event, split, above, below));
    split.addEventListener('dblclick', () => {
      state.size[above] = DEFAULT_SIZE[above];
      state.size[below] = DEFAULT_SIZE[below];
      applyMetrics();
      saveLayout(state);
    });
    split.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!mq.matches) return;
      const step = event.shiftKey ? 0.16 : 0.08;
      const sum = state.size[above] + state.size[below];
      if (event.key === 'ArrowUp') state.size[above] = clamp(state.size[above] + step, 0.15, sum - 0.15);
      else if (event.key === 'ArrowDown') state.size[above] = clamp(state.size[above] - step, 0.15, sum - 0.15);
      else return;
      state.size[below] = sum - state.size[above];
      event.preventDefault();
      applyMetrics();
      saveLayout(state);
    });
    return split;
  }

  function makeEndSplit(id: DeskZoneId): HTMLElement {
    const split = document.createElement('div');
    split.className = 'pane-split pane-end';
    split.role = 'separator';
    split.tabIndex = 0;
    split.ariaOrientation = 'horizontal';
    split.title = `Drag to resize ${ZONE_LABEL[id]}. Double-click to reset.`;
    split.setAttribute('aria-label', split.title);
    split.addEventListener('pointerdown', (event) => onEndDown(event, split, id));
    split.addEventListener('dblclick', () => {
      state.size[id] = DEFAULT_SIZE[id];
      applyMetrics();
      saveLayout(state);
    });
    split.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!mq.matches) return;
      const step = event.shiftKey ? 48 : 24;
      if (event.key === 'ArrowDown') state.size[id] = sizeForHeight(id, heightFor(id) + step);
      else if (event.key === 'ArrowUp') state.size[id] = sizeForHeight(id, heightFor(id) - step);
      else return;
      event.preventDefault();
      applyMetrics();
      saveLayout(state);
    });
    return split;
  }

  function onEndDown(event: PointerEvent, split: HTMLElement, id: DeskZoneId): void {
    if (!mq.matches || event.button !== 0) return;
    event.preventDefault();
    split.setPointerCapture(event.pointerId);
    split.classList.add('is-active');
    const startY = event.clientY;
    const startPx = zones[id].getBoundingClientRect().height;
    const move = (ev: PointerEvent) => {
      state.size[id] = sizeForHeight(id, Math.max(MIN_PANE_PX, startPx + (ev.clientY - startY)));
      applyMetrics();
    };
    const up = () => {
      split.classList.remove('is-active');
      split.removeEventListener('pointermove', move);
      split.removeEventListener('pointerup', up);
      split.removeEventListener('pointercancel', up);
      saveLayout(state);
    };
    split.addEventListener('pointermove', move);
    split.addEventListener('pointerup', up);
    split.addEventListener('pointercancel', up);
  }

  function onColDown(event: PointerEvent, split: HTMLElement): void {
    if (!mq.matches || event.button !== 0) return;
    if (state.columns[0].length === 0 || state.columns[1].length === 0) return;
    event.preventDefault();
    split.setPointerCapture(event.pointerId);
    split.classList.add('is-active');
    const startX = event.clientX;
    const startSplit = state.split;
    const width = Math.max(1, desk.getBoundingClientRect().width);
    const move = (ev: PointerEvent) => {
      const minFrac = Math.min(MAX_SPLIT - 0.05, MIN_COLUMN_PX / width);
      state.split = clamp(startSplit + (ev.clientX - startX) / width, Math.max(MIN_SPLIT, minFrac), MAX_SPLIT);
      applyMetrics();
    };
    const up = () => {
      split.classList.remove('is-active');
      split.removeEventListener('pointermove', move);
      split.removeEventListener('pointerup', up);
      split.removeEventListener('pointercancel', up);
      saveLayout(state);
    };
    split.addEventListener('pointermove', move);
    split.addEventListener('pointerup', up);
    split.addEventListener('pointercancel', up);
  }

  function onRowDown(event: PointerEvent, split: HTMLElement, above: DeskZoneId, below: DeskZoneId): void {
    if (!mq.matches || event.button !== 0) return;
    event.preventDefault();
    split.setPointerCapture(event.pointerId);
    split.classList.add('is-active');
    const startY = event.clientY;
    const abovePx = zones[above].getBoundingClientRect().height;
    const belowPx = zones[below].getBoundingClientRect().height;
    const pair = Math.max(1, abovePx + belowPx);
    const move = (ev: PointerEvent) => {
      const nextAbove = clamp(abovePx + (ev.clientY - startY), MIN_PANE_PX, Math.max(MIN_PANE_PX, pair - MIN_PANE_PX));
      state.size[above] = sizeForHeight(above, nextAbove);
      state.size[below] = sizeForHeight(below, pair - nextAbove);
      applyMetrics();
    };
    const up = () => {
      split.classList.remove('is-active');
      split.removeEventListener('pointermove', move);
      split.removeEventListener('pointerup', up);
      split.removeEventListener('pointercancel', up);
      saveLayout(state);
    };
    split.addEventListener('pointermove', move);
    split.addEventListener('pointerup', up);
    split.addEventListener('pointercancel', up);
  }

  function onGripDown(event: PointerEvent, id: DeskZoneId, grip: HTMLElement): void {
    if (!mq.matches || event.button !== 0 || dragId) return;
    event.preventDefault();
    event.stopPropagation();
    grip.focus();
    grip.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    let armed = false;

    const move = (ev: PointerEvent) => {
      if (!armed) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
        armed = true;
        beginDrag(id, grip);
      }
      drop = dropAt(ev.clientX, ev.clientY);
      showDrop(drop);
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      if (armed && drop) place(id, drop);
      cancelDrag();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  }

  function beginDrag(id: DeskZoneId, grip: HTMLElement): void {
    dragId = id;
    grip.setAttribute('aria-grabbed', 'true');
    zones[id].classList.add('is-dragging');
    desk.classList.add('is-dragging');
    document.body.classList.add('desk-dragging');
    applyMetrics();
  }

  function cancelDrag(): void {
    if (dragId) zones[dragId].classList.remove('is-dragging');
    dragId = null;
    drop = null;
    desk.classList.remove('is-dragging');
    document.body.classList.remove('desk-dragging');
    indicator.hidden = true;
    indicator.classList.remove('is-slot');
    for (const grip of desk.querySelectorAll('.desk-grip')) grip.setAttribute('aria-grabbed', 'false');
    applyMetrics();
  }

  function onGripKey(event: KeyboardEvent, id: DeskZoneId, grip: HTMLElement): void {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!mq.matches) return;
    if (event.key === 'ArrowUp') nudge(id, 0, -1);
    else if (event.key === 'ArrowDown') nudge(id, 0, 1);
    else if (event.key === 'ArrowLeft') nudge(id, -1, 0);
    else if (event.key === 'ArrowRight') nudge(id, 1, 0);
    else return;
    event.preventDefault();
    event.stopPropagation();
    grip.focus();
  }

  function nudge(id: DeskZoneId, columnDelta: number, indexDelta: number): void {
    const from = columnOf(id);
    if (columnDelta !== 0) {
      const target = (from + columnDelta) as 0 | 1;
      if (target !== 0 && target !== 1) return;
      const index = state.columns[from].indexOf(id);
      place(id, { column: target, before: state.columns[target][index] ?? null });
      return;
    }
    const list = state.columns[from];
    const index = list.indexOf(id);
    const next = index + indexDelta;
    if (next < 0 || next >= list.length) return;
    const neighbor = list[next]!;
    place(id, { column: from, before: indexDelta < 0 ? neighbor : (list[next + 1] ?? null) });
  }

  function columnOf(id: DeskZoneId): 0 | 1 {
    return state.columns[0].includes(id) ? 0 : 1;
  }

  function place(id: DeskZoneId, target: DropAt): void {
    const from = columnOf(id);
    const fromList = state.columns[from];
    const fromIndex = fromList.indexOf(id);
    if (from === target.column) {
      const currentBefore = fromList[fromIndex + 1] ?? null;
      if (currentBefore === target.before) return;
    }
    fromList.splice(fromIndex, 1);
    const dest = state.columns[target.column];
    if (target.before === null || target.before === id) dest.push(id);
    else {
      const at = dest.indexOf(target.before);
      if (at < 0) dest.push(id);
      else dest.splice(at, 0, id);
    }
    saveLayout(state);
    render();
  }

  function dropAt(x: number, y: number): DropAt | null {
    const columns = [...desk.querySelectorAll<HTMLElement>('.desk-col')];
    let best: { column: 0 | 1; rect: DOMRect; distance: number } | null = null;
    for (const column of columns) {
      const index = Number(column.dataset.col) as 0 | 1;
      const rect = column.getBoundingClientRect();
      const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
      const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      const distance = dx + dy;
      if (!best || distance < best.distance) best = { column: index, rect, distance };
    }
    if (!best || best.distance > 80) return null;
    const ids = state.columns[best.column].filter((id) => id !== dragId);
    for (const id of ids) {
      const rect = zones[id].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return { column: best.column, before: id };
    }
    return { column: best.column, before: null };
  }

  function showDrop(target: DropAt | null): void {
    if (!target) {
      indicator.hidden = true;
      return;
    }
    const column = desk.querySelector<HTMLElement>(`.desk-col[data-col="${target.column}"]`);
    if (!column) {
      indicator.hidden = true;
      return;
    }
    const deskRect = desk.getBoundingClientRect();
    const colRect = column.getBoundingClientRect();
    const remaining = state.columns[target.column].filter((id) => id !== dragId);
    indicator.hidden = false;
    if (remaining.length === 0) {
      indicator.classList.add('is-slot');
      placeIndicator(colRect.left - deskRect.left, colRect.top - deskRect.top, colRect.width, colRect.height);
      return;
    }
    indicator.classList.remove('is-slot');
    const edge = target.before
      ? zones[target.before].getBoundingClientRect().top
      : zones[remaining[remaining.length - 1]!].getBoundingClientRect().bottom;
    placeIndicator(colRect.left - deskRect.left, edge - deskRect.top - 2, colRect.width, 3);
  }

  function placeIndicator(left: number, top: number, width: number, height: number): void {
    indicator.style.left = `${left}px`;
    indicator.style.top = `${top}px`;
    indicator.style.width = `${width}px`;
    indicator.style.height = `${height}px`;
  }
}

function clearPaneBox(pane: HTMLElement): void {
  pane.style.flex = '';
  pane.style.height = '';
  pane.style.minHeight = '';
  pane.style.maxHeight = '';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
