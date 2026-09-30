import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packages = ['core', 'loader', 'keyboard'];
const documents = [
  'README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md',
  'docs/architecture.md', 'docs/shared-components.md', 'docs/roadmap.md',
  'examples/README.md', ...packages.map((name) => `packages/${name}/README.md`),
];

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
console.log(`Repository check passed: ${packages.length} package manifests and ${documents.length} documents.`);
console.log('Runtime components, external loading and device compatibility remain unimplemented/unverified.');
