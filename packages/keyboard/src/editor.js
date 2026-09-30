// UTF-16 offsets at user-visible cluster boundaries, without DOM or Intl.
export function boundaries(text) {
  const result = [0];
  let offset = 0;
  let joinNext = false;
  let regional = 0;
  for (const character of Array.from(text)) {
    const cp = character.codePointAt(0);
    const combining = (cp >= 0x300 && cp <= 0x36f) || (cp >= 0x1ab0 && cp <= 0x1aff) ||
      (cp >= 0x1dc0 && cp <= 0x1dff) || (cp >= 0xfe00 && cp <= 0xfe0f) ||
      (cp >= 0xfe20 && cp <= 0xfe2f) || (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
      (cp >= 0xe0100 && cp <= 0xe01ef);
    const flag = cp >= 0x1f1e6 && cp <= 0x1f1ff;
    if (offset && !combining && !joinNext && cp !== 0x200d && !(flag && regional % 2)) result.push(offset);
    regional = flag ? regional + 1 : 0;
    joinNext = cp === 0x200d;
    offset += character.length;
  }
  if (offset) result.push(offset);
  return result;
}

export function createEditor(value = '', maxLength = 4096) {
  let text = String(value);
  let cursor = text.length;
  if (!Number.isInteger(maxLength) || maxLength < 1 || boundaries(text).length - 1 > maxLength) throw new RangeError('Invalid text length');
  return {
    snapshot() { return { text, cursor }; },
    insert(value) {
      const next = text.slice(0, cursor) + value + text.slice(cursor);
      if (boundaries(next).length - 1 > maxLength) return false;
      text = next;
      cursor += value.length;
      // Inserting a combining character/ZWJ can join the following cluster.
      cursor = boundaries(text).find((position) => position >= cursor);
      return true;
    },
    move(direction) {
      const positions = boundaries(text);
      const index = positions.indexOf(cursor);
      cursor = positions[Math.max(0, Math.min(positions.length - 1, index + direction))];
    },
    deleteBackward() {
      if (!cursor) return;
      const positions = boundaries(text);
      const previous = positions.filter((position) => position < cursor).pop();
      text = text.slice(0, previous) + text.slice(cursor);
      cursor = previous;
    },
  };
}
