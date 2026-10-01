import { execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const adb = process.env.ADB_PATH;
const serial = process.env.ADB_SERIAL;
const width = Number(process.env.FALCON_LOGICAL_WIDTH);
const offset = Number(process.env.FALCON_TOUCH_X_OFFSET);
const appid = process.env.FALCON_DEMO_APPID;
const logPath = process.env.FALCON_LOG_PATH;
if (!adb || !serial || !appid || !logPath || !Number.isFinite(width) || !Number.isFinite(offset)) throw new Error('Set ADB_PATH, ADB_SERIAL, FALCON_DEMO_APPID, FALCON_LOG_PATH, FALCON_LOGICAL_WIDTH and verified FALCON_TOUCH_X_OFFSET. This test uses the RK3562 mapping verified in docs/keyboard-device-acceptance.md.');
if (width !== 960) throw new Error('This acceptance scenario uses the verified 960 x 266 host profile; adapt coordinates for other profiles.');
if (!/^\/userdata\/applog\/[A-Za-z0-9_.-]+\.log$/.test(logPath)) throw new Error('Invalid device log path');
const output = resolve('artifacts/keyboard-device-test');
await mkdir(output, { recursive: true });
function shell(command) { return execFileSync(adb, ['-s', serial, 'shell', command], { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 }).replace(/\r/g, ''); }
function tap(x, y, duration = 120) { shell(`send_event touch press ${Math.round(y + offset)} ${Math.round(width - 1 - x)}; sleep ${duration / 1000}; send_event touch release; sleep 0.15`); }
function swipe(x1, y1, x2, y2) { shell(`send_event touch press ${Math.round(y1 + offset)} ${Math.round(width - 1 - x1)}; send_event touch slip ${Math.round(y2 + offset)} ${Math.round(width - 1 - x2)}; send_event touch release; sleep 0.2`); }
function logs() { return shell(`tail -n 500 ${logPath}`).split('\n').filter((line) => line.includes('[keyboard-demo]')); }
function state() {
  const row = logs().filter((line) => line.includes('[keyboard-demo] state ')).pop();
  if (!row) throw new Error('No keyboard state diagnostics; use the keyboard demo');
  return JSON.parse(row.slice(row.indexOf('[keyboard-demo] state ') + 22));
}
function check(value, label) { if (!value) throw new Error('Device assertion failed: ' + label + ' ' + JSON.stringify(state())); console.log('PASS ' + label); }
function capture(name) { if (process.env.FALCON_CAPTURE === '1') execFileSync(process.execPath, ['scripts/capture-keyboard-device.mjs', resolve(output, name + '.png')], { stdio: 'inherit', windowsHide: true }); }
function localTap(x, y, duration) { const b = state().bounds; tap(b.x + x, b.y + y, duration); }
function key(value, duration) {
  const item = state().keys.find((row) => row.value === value);
  check(Boolean(item), 'key available ' + value);
  localTap(item.x + item.width / 2, item.y + item.height / 2, duration);
}
function mode(index) { localTap(state().bounds.width - 224 + index * 34 + 17, 13); }
function cancel() { localTap(state().bounds.width - 20, 13); }
function candidate(text) {
  const current = state();
  const index = current.candidates.indexOf(text);
  check(index >= 0, 'candidate ' + text);
  const compositionWidth = current.bounds.width > 500 ? 76 : 62;
  const count = current.bounds.width > 500 ? 4 : 2;
  localTap(compositionWidth + (index + 0.5) * (current.bounds.width - compositionWidth - 52) / count, 40);
}
// Coordinates of host controls belong to this demo; keyboard geometry comes from diagnostics.
tap(890, 19);
mode(1); mode(0);
for (const character of '64426') key(character);
capture('t9'); candidate('你好');
check(state().text.endsWith('你好'), 'T9 word selection');
localTap(state().bounds.width - 64, 13);
for (const character of 'zhongguo') key(character);
capture('qwerty'); candidate('中国');
check(state().text.endsWith('你好中国'), '26-key word selection');
mode(1); for (const character of 'abc') key(character);
check(state().text.endsWith('abc'), 'English input');
mode(2); for (const character of '123') key(character);
check(state().text.endsWith('abc123'), 'numeric input');
mode(3); key('，');
check(state().text.endsWith('abc123，'), 'symbol input');
key('↵'); check(state().text.endsWith('，\n'), 'newline distinct from confirm');
key('⌫'); check(state().text.endsWith('，'), 'delete removes newline');
key('确定');
let results = logs().filter((line) => line.includes('[keyboard-demo] result '));
check(results[results.length - 1].includes('"confirmed":true'), 'confirm resolves result');
tap(890, 19); mode(1); key('x'); cancel();
results = logs().filter((line) => line.includes('[keyboard-demo] result '));
check(results[results.length - 1].includes('"confirmed":false'), 'cancel resolves result');
tap(780, 19); check(state().visible, 'floating keyboard opens'); capture('floating');
tap(890, 19); mode(1);
const beforeGap = state().text;
let current = state();
let q = current.keys.find((row) => row.value === 'q');
localTap(q.x + q.width + 1, q.y + q.height / 2);
check(state().text === beforeGap + 'q', 'letter gap correction');
const beforeSwipe = state().text;
current = state();
const a = current.keys.find((row) => row.value === 'a');
swipe(current.bounds.x + a.x + 8, current.bounds.y + a.y + 8, current.bounds.x + a.x + 42, current.bounds.y + a.y + 8);
check(state().text === beforeSwipe, 'moved touch cancels');
key('⌫', 850);
const afterDelete = state().text;
check(afterDelete.length < beforeSwipe.length - 1, 'long deletion repeats');
shell('sleep 0.5'); check(state().text === afterDelete, 'long deletion stops after release');
mode(2); const beforeNumberGap = state().text;
const one = state().keys.find((row) => row.value === '1');
localTap(one.x + one.width + 1, one.y + one.height / 2);
check(state().text === beforeNumberGap, 'numbers do not use gap correction');
for (let i = 0; i < 5; i++) { cancel(); tap(890, 19); }
check(state().visible, 'five repeated close/open cycles');
await writeFile(resolve(output, 'diagnostics.log'), logs().join('\n') + '\n');
await writeFile(resolve(output, 'result.json'), JSON.stringify({ passed: true, testedAt: new Date().toISOString(), checks: ['T9', 'qwerty', 'Chinese candidate', 'English', 'number', 'symbol', 'newline', 'delete', 'confirm', 'cancel', 'floating', 'letter gap correction', 'move cancellation', 'long delete', 'number gap rejection', 'repeat open/close'], note: 'Diagnostics contain test text; device identity stays in environment and is not persisted.' }, null, 2) + '\n');
console.log('Real-device input acceptance passed. Screenshot acceptance is separate.');
