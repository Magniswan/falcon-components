import lexicon from '../data/lexicon.js';
import { createKeyboard } from './index.js';
import { createPinyinEngine } from './pinyin.js';

/** One engine per component instance; disposal releases dictionary references. */
export function createOfflineKeyboard(options = {}) {
  const engine = createPinyinEngine(lexicon);
  const keyboard = createKeyboard({ ...options, engine });
  const dispose = keyboard.dispose;
  keyboard.dispose = () => { dispose(); engine.dispose(); };
  return keyboard;
}
