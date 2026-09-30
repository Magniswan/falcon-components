import { readFile, access, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import './check-catalog.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packages = (await readdir(resolve(root, 'packages'), { withFileTypes: true })).filter((item) => item.isDirectory()).map((item) => item.name);
async function filesUnder(directory) {
  const result = [];
  for (const item of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const filename = `${directory}/${item.name}`;
    if (item.isDirectory()) result.push(...await filesUnder(filename));
    else if (item.isFile()) result.push(filename);
  }
  return result;
}
const sourceFiles = (await Promise.all(['packages', 'docs', 'examples', 'scripts', 'test', 'test-support', 'catalog'].map(filesUnder))).flat();
const documents = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md', ...sourceFiles.filter((file) => file.endsWith('.md'))];

await access(resolve(root, 'LICENSE'));
const rootPackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (!rootPackage.private || rootPackage.license !== 'MIT') {
  throw new Error('Root package must remain private and declare MIT.');
}
for (const name of packages) {
  const relative = `packages/${name}/package.json`;
  const manifest = JSON.parse(await readFile(resolve(root, relative), 'utf8'));
  if (manifest.name !== `@falcon-components/${name}` || !manifest.private) {
    throw new Error(`Invalid initial package: ${relative}`);
  }
  if (typeof manifest.exports === 'string') await access(resolve(root, `packages/${name}`, manifest.exports));
  else if (manifest.exports) {
    for (const entry of Object.values(manifest.exports)) await access(resolve(root, `packages/${name}`, entry));
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version) || manifest.license !== 'MIT') {
    throw new Error(`Invalid version or license: ${relative}`);
  }
}
for (const relative of documents) {
  const filename = resolve(root, relative);
  const content = await readFile(filename, 'utf8');
  if (!content.trim()) throw new Error(`Empty document: ${relative}`);
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^[a-z]+:/i.test(target) || target.startsWith('#')) continue;
    await access(resolve(dirname(filename), target.split('#')[0]));
  }
}
for (const relative of sourceFiles) {
  if (relative.endsWith('.json')) JSON.parse(await readFile(resolve(root, relative), 'utf8'));
  if (/\.(js|mjs)$/.test(relative)) {
    const result = spawnSync(process.execPath, ['--check', resolve(root, relative)], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(`Syntax check failed: ${relative}\n${result.stderr}`);
  }
}
console.log(`Repository check passed: ${packages.length} package manifests, ${documents.length} documents, and source syntax.`);
console.log('Falcon device adapters, external Vue rendering and hardware compatibility still require real-device validation.');
