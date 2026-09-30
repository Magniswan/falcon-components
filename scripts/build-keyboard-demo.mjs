import { mkdir, writeFile, symlink, access, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = process.env.FALCON_CLI_PATH;
const appid = process.env.FALCON_DEMO_APPID;
const width = Number(process.env.FALCON_LOGICAL_WIDTH);
const height = Number(process.env.FALCON_LOGICAL_HEIGHT);
if (!cli || !/^\d{16}$/.test(appid || '') || !Number.isFinite(width) || !Number.isFinite(height)) throw new Error('Set FALCON_CLI_PATH, FALCON_DEMO_APPID (16 digits), FALCON_LOGICAL_WIDTH and FALCON_LOGICAL_HEIGHT from the host profile.');
const output = resolve(root, 'artifacts/keyboard-demo');
await mkdir(resolve(output, 'src/pages/index'), { recursive: true });
await mkdir(resolve(output, 'node_modules'), { recursive: true });
try { await access(resolve(output, 'node_modules/falcon-ui')); } catch {
  await symlink(process.env.FALCON_UI_PATH || resolve(dirname(cli), '../../falcon-ui'), resolve(output, 'node_modules/falcon-ui'), process.platform === 'win32' ? 'junction' : 'dir');
}
await writeFile(resolve(output, 'package.json'), JSON.stringify({ name: 'FalconKeyboardDemo', appid, version: '0.1.0', quickjs: { version: '20200705', bigNum: false }, 'single-js-bundle': false }));
await mkdir(resolve(output, 'src/pages/blank'), { recursive: true });
await writeFile(resolve(output, 'src/pages/blank/blank.vue'), '<template><div><text>Falcon components</text></div></template><script>export default {};</script>');
await writeFile(resolve(output, 'src/app.json'), JSON.stringify({ pages: { index: 'pages/index/index.vue', blank: 'pages/blank/blank.vue' }, options: { alias: { '@demo': '../../examples/keyboard-demo/KeyboardDemo.vue' } } }));
await writeFile(resolve(output, 'src/app.js'), `class DemoPage extends $falcon.Page {
  onHide() { super.onHide(); if (this.$root && this.$root.onHide) this.$root.onHide(); }
  onUnload() { if (this.$root && this.$root.onUnload) this.$root.onUnload(); super.onUnload(); }
}
export default class App extends $falcon.App {
  onLaunch(options) { super.onLaunch(options); this.setViewPort(${width}); $falcon.useDefaultBasePageClass(DemoPage); }
}
`);
await writeFile(resolve(output, 'src/pages/index/index.vue'), `<template><keyboard-demo :profile="profile" :diagnostics="diagnostics" /></template>\n<script>import Demo from '@demo'; export default { components: { KeyboardDemo: Demo }, data() { return { profile: { width: ${width}, height: ${height} }, diagnostics: ${process.env.FALCON_DEMO_DIAGNOSTICS === '1'} }; } }; </script>\n`);
await new Promise((accept, reject) => {
  const child = spawn(process.execPath, [resolve(cli), 'build', '-c', '-q', '-p'], { cwd: output, stdio: 'inherit', windowsHide: true });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? accept() : reject(new Error(`Falcon compiler exited with ${code}`)));
});
console.log(JSON.stringify({ output, files: await readdir(output) }));
