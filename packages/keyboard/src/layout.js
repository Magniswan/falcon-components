const qwerty = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const t9 = [['2 ABC', '3 DEF', '4 GHI'], ['5 JKL', '6 MNO', '7 PQRS'], ['8 TUV', '9 WXYZ', "'"]];
const symbols = [['，', '。', '？', '！', '：', '；', '（', '）', '、', '…'], ['@', '#', '$', '%', '&', '*', '-', '+', '=', '_'], ['/', '\\', '[', ']', '{', '}', '"', "'", '<', '>']];
export function createLayout({ width, height, mode, layout, shift }) {
  const compact = height < 220;
  const header = compact ? 28 : 34;
  const candidateHeight = compact ? 28 : 34;
  const toolbarHeight = compact ? 26 : 30;
  const keyTop = header + candidateHeight + toolbarHeight;
  const gap = 4;
  const rowHeight = (height - keyTop - 5 * gap) / 4;
  if (width < 240 || rowHeight < 22) throw new RangeError('Keyboard bounds are too small; host must provide at least 240 x 190');
  let rows;
  if (mode === 'symbol') rows = symbols;
  else if (mode === 'number') rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']];
  else if (mode === 'pinyin' && layout === 't9') rows = t9;
  else rows = qwerty.map((row) => Array.from(shift && mode === 'english' ? row.toUpperCase() : row));
  const controls = ['⌫', '←', '→'];
  const display = { '⌫': '删除', '↵': '换行', '⇧': shift ? '小写' : '大写', ABC: '英文' };
  const keys = [];
  rows.forEach((labels, row) => {
    const count = labels.length + 1;
    const keyWidth = (width - gap * (count + 1)) / count;
    [...labels, controls[row]].forEach((label, column) => {
      keys.push({ id: `${row}:${column}`, label: display[label] || label, value: label.indexOf(' ') > 0 ? label[0] : label,
        x: gap + column * (keyWidth + gap), y: keyTop + gap + row * (rowHeight + gap), width: keyWidth, height: rowHeight, control: column === labels.length });
    });
  });
  const bottom = mode === 'number' ? ['ABC', '0', '.', '↵', '确定'] : [mode === 'english' ? '⇧' : 'ABC', '空格', '↵', '确定'];
  const units = mode === 'number' ? [1, 1, 1, 1, 2] : [1, 3, 1, 2];
  const unit = (width - gap * (bottom.length + 1)) / units.reduce((a, b) => a + b, 0);
  let x = gap;
  bottom.forEach((label, i) => {
    const keyWidth = unit * units[i];
    keys.push({ id: `3:${i}`, label: display[label] || label, value: label, x, y: keyTop + gap + 3 * (rowHeight + gap), width: keyWidth, height: rowHeight, control: true });
    x += keyWidth + gap;
  });
  return { keys, header, candidateHeight, toolbarHeight, keyTop, rowHeight };
}

export function resolveTouch(keys, point, { correction = true, margin = 4 } = {}) {
  for (const key of keys) if (point.x >= key.x && point.x < key.x + key.width && point.y >= key.y && point.y < key.y + key.height) return key;
  if (!correction) return null;
  let best = null;
  let distance = Infinity;
  for (const key of keys) {
    if (key.control) continue;
    const dx = Math.max(key.x - point.x, 0, point.x - key.x - key.width);
    const dy = Math.max(key.y - point.y, 0, point.y - key.y - key.height);
    const score = dx * dx + dy * dy;
    if (score <= margin * margin && score < distance) { best = key; distance = score; }
  }
  return best;
}
