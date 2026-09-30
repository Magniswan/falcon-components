import { mkdir, writeFile, readdir, access, symlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = process.env.FALCON_CLI_PATH;
if (!cli) throw new Error('Set FALCON_CLI_PATH to your local aiot-vue-cli/src/cli.js. No SDK is included.');
const output = resolve(root, 'artifacts', `falcon-build-${Date.now()}`);
await mkdir(resolve(output, 'src/pages/index'), { recursive: true });
const themePackage = process.env.FALCON_UI_PATH || resolve(dirname(cli), '../../falcon-ui');
try {
  await access(themePackage);
  await mkdir(resolve(output, 'node_modules'), { recursive: true });
  await symlink(resolve(themePackage), resolve(output, 'node_modules/falcon-ui'), process.platform === 'win32' ? 'junction' : 'dir');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(resolve(output, 'package.json'), JSON.stringify({
  name: 'FalconComponentsCompileCheck', appid: 'BUILD_CHECK_ONLY', version: '0.1.0',
  quickjs: { version: '20200705', bigNum: false }, 'single-js-bundle': true,
}));
await writeFile(resolve(output, 'src/app.json'), JSON.stringify({
  pages: { index: 'pages/index/index.vue' },
  options: { alias: {
    '@falcon-components/core': '../../packages/core/src/index.js',
    '@falcon-components/loader': '../../packages/loader/src/index.js',
    '@falcon-components/ui': '../../packages/ui/src/index.js',
    '@demo': '../../examples/falcon-host/ComponentDemo.vue',
    '@host': '../../examples/falcon-host/component-host.js',
  } },
}));
await writeFile(resolve(output, 'src/app.js'), 'export default class App extends $falcon.App {}\n');
await writeFile(resolve(output, 'src/pages/index/index.vue'), `<template><component-demo :host="host" /></template>
<script>
import Demo from '@demo';
import { createFalconComponentHost } from '@host';
export default {
  components: { ComponentDemo: Demo },
  data() { return { host: createFalconComponentHost(this.$componentServices) }; },
};
</script>\n`);
await new Promise((accept, reject) => {
  const child = spawn(process.execPath, [resolve(cli), 'build', '-c', '-q'], { cwd: output, stdio: 'inherit', windowsHide: true });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? accept() : reject(new Error(`Falcon compiler exited with ${code}`)));
});
const built = await readdir(resolve(output, '.falcon_'));
if (!built.some((name) => name.endsWith('.js.bin'))) throw new Error('No QuickJS bytecode output was produced');
console.log('Falcon Vue/production-bytecode compile check passed. This is not a runnable device application or hardware acceptance.');
