const digits = { a: '2', b: '2', c: '2', d: '3', e: '3', f: '3', g: '4', h: '4', i: '4', j: '5', k: '5', l: '5', m: '6', n: '6', o: '6', p: '7', q: '7', r: '7', s: '7', t: '8', u: '8', v: '8', w: '9', x: '9', y: '9', z: '9' };
export function toT9(code) { return Array.from(code).map((character) => digits[character] || '').join(''); }
function lowerBound(rows, records, column, key) {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (records[rows[mid]][column] < key) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function createPinyinEngine(data) {
  const indexed = JSON.parse(data);
  let records = indexed.records;
  if (!Array.isArray(records) || !Array.isArray(indexed.t9) || !Array.isArray(indexed.qwerty)) throw new TypeError('Invalid indexed lexicon');
  return {
    size: records.length,
    query(composition, { layout = 'qwerty', limit = 48 } = {}) {
      const input = composition.toLowerCase().replace(/'/g, '');
      if (!input || input.length > 48 || !/^[a-z]+$|^[2-9]+$/.test(input)) return [];
      const rows = indexed[layout];
      const column = layout === 't9' ? 4 : 3;
      if (!rows || !records) return [];
      const candidates = [];
      const compare = (a, b) => Number(b.exact) - Number(a.exact) || b.frequency - a.frequency || a.id - b.id;
      const capacity = Math.max(1, Math.min(128, limit));
      for (let i = lowerBound(rows, records, column, input); i < rows.length && records[rows[i]][column].startsWith(input); i++) {
        const id = rows[i];
        const row = records[id];
        const exact = row[column] === input;
        const worst = candidates[candidates.length - 1];
        if (candidates.length >= capacity && (Number(exact) < Number(worst.exact) || (exact === worst.exact && row[2] < worst.frequency))) continue;
        const candidate = { id, text: row[0], pinyin: row[1], frequency: row[2], code: row[3], consumed: composition.length, exact };
        if (candidates.some((item) => item.text === candidate.text && compare(item, candidate) <= 0)) continue;
        const duplicate = candidates.findIndex((item) => item.text === candidate.text);
        if (duplicate >= 0) candidates.splice(duplicate, 1);
        let at = candidates.findIndex((item) => compare(candidate, item) < 0);
        if (at < 0) at = candidates.length;
        candidates.splice(at, 0, candidate);
        if (candidates.length > capacity) candidates.pop();
      }
      return candidates;
    },
    dispose() { records = null; indexed.records = null; indexed.t9 = null; indexed.qwerty = null; },
  };
}
