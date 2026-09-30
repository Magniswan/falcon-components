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
function shell(command) { return execFileSync(adb, ['-s', serial, 'shell', command], { encoding: 'utf8', timeout: 30000 }).replace(/\r/g, ''); }
function tap(x, y, duration = 120) { shell(`send_event touch press ${Math.round(y + offset)} ${Math.round(width - 1 - x)}; sleep ${duration / 1000}; send_event touch release; sleep 0.15`); }
function swipe(x1, y1, x2, y2) { shell(`send_event touch press ${Math.round(y1 + offset)} ${Math.round(width - 1 - x1)}; send_event touch slip ${Math.round(y2 + offset)} ${Math.round(width - 1 - x2)}; send_event touch release; sleep 0.2`); }
function logs() { return shell(`tail -n 1500 ${logPath}`).split('\n').filter((line) => line.includes('[keyboard-demo]')); }
function state() {
  const row = logs().filter((line) => line.includes('[keyboard-demo] state ')).pop();
  if (!row) throw new Error('No keyboard state diagnostics; use the keyboard demo');
  return JSON.parse(row.slice(row.indexOf('[keyboard-demo] state ') + 22));
}
function check(value, label) { if (!value) throw new Error('Device assertion failed: ' + label + ' ' + JSON.stringify(state())); console.log('PASS ' + label); }
function capture(name) { if (process.env.FALCON_CAPTURE === '1') execFileSync(process.execPath, ['scripts/capture-keyboard-device.mjs', resolve(output, name + '.png')], { stdio: 'inherit', windowsHide: true }); }
function candidate(text) {
  const current = state();
  const index = current.candidates.indexOf(text);
  check(index >= 0, 'candidate ' + text);
  tap(128 + (index + 0.5) * 130, 51);
}
// Explicit mode switches clear old composition. Root events exercise actual Falcon Vue dispatch.
tap(926, 17); tap(890, 19);
tap(72, 83); tap(24, 83);
// Nine-key nihao = 64426.
const t9 = { '2': [121, 121], '3': [360, 121], '4': [600, 121], '5': [121, 162], '6': [360, 162], '7': [600, 162], '8': [121, 202], '9': [360, 202] };
for (const character of '64426') tap(...t9[character]);
capture('t9');
candidate('你好');
check(state().text.endsWith('你好'), 'T9 word selection');
// Change to 26 keys, then enter zhongguo.
tap(240, 83);
const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
function letter(character) {
  const row = rows.findIndex((value) => value.includes(character));
  const col = rows[row].indexOf(character);
  const count = rows[row].length + 1;
  const keyWidth = (960 - 4 * (count + 1)) / count;
  tap(4 + col * (keyWidth + 4) + keyWidth / 2, 121 + row * 41);
}
for (const character of 'zhongguo') letter(character);
capture('qwerty');
candidate('中国');
check(state().text.endsWith('你好中国'), '26-key word selection');
tap(72, 83); letter('a'); letter('b'); letter('c');
check(state().text.endsWith('abc'), 'English input');
tap(120, 83); tap(121, 121); tap(360, 121); tap(600, 121);
check(state().text.endsWith('abc123'), 'numeric input');
tap(168, 83); tap(45, 121);
check(state().text.endsWith('abc123，'), 'symbol input');
tap(616, 243);
check(state().text.endsWith('，\n'), 'newline distinct from confirm');
tap(915, 121);
check(state().text.endsWith('，'), 'delete removes newline');
// Confirm, reopen and cancel must preserve the confirmed value.
tap(821, 243);
let results = logs().filter((line) => line.includes('[keyboard-demo] result '));
check(results[results.length - 1].includes('"confirmed":true'), 'confirm resolves result');
tap(890, 19); tap(72, 83); letter('x'); tap(926, 17);
results = logs().filter((line) => line.includes('[keyboard-demo] result '));
check(results[results.length - 1].includes('"confirmed":false'), 'cancel resolves result');
tap(780, 19);
check(state().visible, 'floating keyboard opens');
capture('floating');
// The host button remains interactive outside the floating keyboard bounds.
tap(890, 19);
tap(72, 83);
const beforeGap = state().text;
tap(88, 121);
check(state().text === beforeGap + 'q', 'letter gap correction');
const beforeSwipe = state().text;
swipe(50, 162, 90, 162);
check(state().text === beforeSwipe, 'moved touch cancels');
tap(915, 121, 850);
const afterDelete = state().text;
check(afterDelete.length < beforeSwipe.length - 1, 'long deletion repeats');
shell('sleep 0.5');
check(state().text === afterDelete, 'long deletion stops after release');
tap(120, 83);
const beforeNumberGap = state().text;
tap(240, 121);
check(state().text === beforeNumberGap, 'numbers do not use gap correction');
for (let i = 0; i < 5; i++) { tap(926, 17); tap(890, 19); }
check(state().visible, 'five repeated close/open cycles');
await writeFile(resolve(output, 'diagnostics.log'), logs().join('\n') + '\n');
await writeFile(resolve(output, 'result.json'), JSON.stringify({ passed: true, testedAt: new Date().toISOString(), checks: ['T9', 'qwerty', 'Chinese candidate', 'English', 'number', 'symbol', 'newline', 'delete', 'confirm', 'cancel', 'floating', 'letter gap correction', 'move cancellation', 'long delete', 'number gap rejection', 'repeat open/close'], note: 'Diagnostics contain test text; device identity stays in environment and is not persisted.' }, null, 2) + '\n');
console.log('Real-device input acceptance passed. Screenshot acceptance is separate.');
