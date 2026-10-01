import { createEditor } from './editor.js';
import { createLayout, resolveTouch } from './layout.js';
export { createPinyinEngine, toT9 } from './pinyin.js';
export { createLayout, resolveTouch } from './layout.js';
export const apiVersion = 1;

export function createKeyboard({ engine, timers = { setTimeout, clearTimeout }, onInset = () => {} } = {}) {
  if (!engine || typeof engine.query !== 'function') throw new TypeError('A pinyin engine is required');
  let session = null;
  let generation = 0;
  let disposed = false;
  let deleteTimer = null;
  let pendingCandidates = null;
  const listeners = new Set();
  function state() {
    if (!session) return { visible: false, keys: [], candidates: [] };
    const editor = session.editor.snapshot();
    const before = editor.text.slice(0, editor.cursor).split('\n').pop();
    const after = editor.text.slice(editor.cursor).split('\n')[0];
    const window = Math.max(6, Math.floor((session.options.bounds.width - 232) / 16));
    const head = Array.from(before);
    return { ...session.options, bounds: { ...session.options.bounds }, ...editor, visible: true, composition: session.composition, candidates: session.candidates.map((row) => ({ ...row })),
      page: session.page, shift: session.shift, busy: session.busy, ...session.geometry, keys: session.geometry.keys.map((key) => ({ ...key })),
      displayText: (head.length > window ? '…' : '') + head.slice(-window).join('') + '│' + Array.from(after).slice(0, window).join('') };
  }
  function emit() { listeners.forEach((listener) => { try { listener(state()); } catch (error) { /* Observers cannot interrupt cleanup or confirmation. */ } }); }
  function stopDelete() { if (deleteTimer !== null) timers.clearTimeout(deleteTimer); deleteTimer = null; }
  function updateLayout() { session.geometry = createLayout({ ...session.options.bounds, ...session.options, shift: session.shift }); }
  function close(confirmed) {
    if (!session) return;
    const current = session;
    session = null;
    generation++;
    stopDelete();
    pendingCandidates = null;
    onInset(null);
    emit();
    current.resolve({ confirmed, text: confirmed ? current.editor.snapshot().text : current.initial });
  }
  async function query() {
    if (!session) return;
    const current = session;
    const token = ++generation;
    current.busy = Boolean(current.composition);
    if (!current.held) current.candidates = [];
    current.page = 0;
    emit();
    let rows = [];
    try {
      rows = await engine.query(current.composition, { layout: current.options.layout, limit: 48 });
      rows = Array.isArray(rows) ? rows.slice(0, 128).filter((row) => row && typeof row.text === 'string' && row.text.length > 0 && row.text.length <= 4096 && Number.isInteger(row.consumed) && row.consumed > 0 && row.consumed <= current.composition.length).map((row, index) => ({ ...row, id: row.id === undefined ? index : row.id })) : [];
    } catch (error) { rows = []; /* Query failure leaves a usable editor. */ }
    if (session !== current || generation !== token) return;
    current.busy = false;
    if (current.held) pendingCandidates = rows;
    else current.candidates = rows;
    emit();
  }
  function insert(value) { if (session.editor.insert(value)) emit(); }
  function select(candidate) {
    if (!session || !candidate || !session.editor.insert(candidate.text)) return;
    session.composition = session.composition.slice(candidate.consumed);
    query();
  }
  function press(value) {
    if (!session) return;
    if (value === '取消') return close(false);
    if (value === '确定') {
      if (session.composition) {
        if (session.candidates.length) select(session.candidates[0]);
        else { insert(session.composition); session.composition = ''; }
      }
      return close(true);
    }
    if (value === '⌫') {
      if (session.composition) { session.composition = session.composition.slice(0, -1); query(); }
      else { session.editor.deleteBackward(); emit(); }
      return;
    }
    if (value === '←' || value === '→') { session.editor.move(value === '←' ? -1 : 1); emit(); return; }
    if (value === '⇧') { session.shift = !session.shift; updateLayout(); emit(); return; }
    if (value === 'ABC') return setMode('english');
    if (value === '空格' || value === '↵') {
      if (session.composition) { if (session.candidates.length) select(session.candidates[0]); else { insert(session.composition); session.composition = ''; query(); } }
      else if (value === '空格') insert(' ');
      else if (session.options.multiline) insert('\n');
      return;
    }
    if (session.options.mode === 'pinyin' && /^[a-z2-9']$/i.test(value)) {
      if (session.composition.length < 48) { session.composition += value.toLowerCase(); query(); }
    } else insert(value);
  }
  function setMode(mode) {
    if (!session || !['pinyin', 'english', 'number', 'symbol'].includes(mode)) return;
    generation++;
    pendingCandidates = null;
    session.composition = '';
    session.candidates = [];
    session.busy = false;
    session.held = null;
    session.candidatePointer = null;
    session.options.mode = mode;
    stopDelete();
    session.pointer = null;
    updateLayout();
    emit();
  }
  function releaseHeld() {
    if (!session) return;
    session.held = null;
    if (pendingCandidates) { session.candidates = pendingCandidates; pendingCandidates = null; emit(); }
  }
  return {
    snapshot: state,
    subscribe(listener) { listeners.add(listener); try { listener(state()); } catch (error) { /* Same isolation as subsequent notifications. */ } return () => listeners.delete(listener); },
    open(options) {
      if (disposed) throw new Error('Keyboard disposed');
      close(false);
      const bounds = options.bounds;
      if (!bounds || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key]))) throw new TypeError('Host logical bounds are required');
      const settings = { mode: 'pinyin', layout: 't9', presentation: 'bottom-overlay', multiline: false, outsideAction: 'interact', ...options, bounds: { ...bounds } };
      if (!['t9', 'qwerty'].includes(settings.layout) || !['pinyin', 'english', 'number', 'symbol'].includes(settings.mode) || !['floating', 'bottom-overlay', 'inset'].includes(settings.presentation) || !['interact', 'block', 'dismiss'].includes(settings.outsideAction)) throw new TypeError('Invalid keyboard options');
      const geometry = createLayout({ ...bounds, ...settings, shift: false });
      const initial = String(options.value || '');
      return new Promise((resolve) => {
        session = { options: settings, initial, editor: createEditor(initial, options.maxLength), composition: '', candidates: [], page: 0, shift: false, busy: false, pointer: null, held: null, geometry, resolve };
        if (settings.presentation === 'inset') onInset({ ...bounds });
        emit();
      });
    },
    press,
    setMode,
    setLayout(layout) { if (!session || !['t9', 'qwerty'].includes(layout)) return; setMode(session.options.mode); session.options.layout = layout; updateLayout(); emit(); },
    select(index) { if (session) select(session.candidates[index]); },
    page(direction, count = 6) { if (session) { session.page = Math.max(0, Math.min(Math.ceil(session.candidates.length / count) - 1, session.page + direction)); emit(); } },
    holdCandidate(index, point) { if (session) { session.held = session.candidates[index] || null; session.candidatePointer = point ? { ...point, cancelled: false } : null; } },
    moveCandidate(point) { if (session && session.candidatePointer && Math.hypot(point.x - session.candidatePointer.x, point.y - session.candidatePointer.y) > 18) session.candidatePointer.cancelled = true; },
    releaseCandidate(cancelled = false) { if (!session) return; const candidate = session.held; const moved = session.candidatePointer && session.candidatePointer.cancelled; session.candidatePointer = null; releaseHeld(); if (!cancelled && !moved) select(candidate); },
    touchStart(point) {
      if (!session || session.pointer) return;
      const key = resolveTouch(session.geometry.keys, point, { correction: session.options.mode === 'pinyin' || session.options.mode === 'english' });
      if (!key) return;
      session.pointer = { ...point, key, cancelled: false, repeated: false };
      if (key.value === '⌫') {
        const current = session;
        const repeat = () => { if (session !== current || !current.pointer || current.pointer.cancelled) return; current.pointer.repeated = true; press('⌫'); deleteTimer = timers.setTimeout(repeat, 90); };
        deleteTimer = timers.setTimeout(repeat, 450);
      }
    },
    touchMove(point) { if (session && session.pointer && session.pointer.id === point.id && Math.hypot(point.x - session.pointer.x, point.y - session.pointer.y) > 18) { session.pointer.cancelled = true; stopDelete(); } },
    touchEnd(point) {
      if (!session || !session.pointer || session.pointer.id !== point.id) return;
      const pointer = session.pointer;
      session.pointer = null;
      stopDelete();
      const within = point.x >= 0 && point.y >= 0 && point.x < session.options.bounds.width && point.y < session.options.bounds.height;
      if (within && !pointer.cancelled && !pointer.repeated) press(pointer.key.value);
    },
    touchCancel() { stopDelete(); if (session) { session.pointer = null; session.candidatePointer = null; } releaseHeld(); },
    outside() { if (!session) return 'interact'; const action = session.options.outsideAction; if (action === 'dismiss') close(false); return action; },
    cancel() { close(false); },
    dispose() { close(false); listeners.clear(); disposed = true; },
  };
}

export function createComponent(context) { return createKeyboard(context); }
