import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateId, validateVersion, validateRelativePath, validateManifest } from '../packages/core/src/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await readFile(resolve(root, 'catalog/index.json'), 'utf8'));
if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.components)) throw new Error('Invalid catalog');
const keys = new Set();
for (const item of catalog.components) {
  validateId(item.id);
  validateVersion(item.version);
  validateRelativePath(item.manifest);
  const key = `${item.id}@${item.version}`;
  if (keys.has(key)) throw new Error(`Duplicate component: ${key}`);
  keys.add(key);
  const filename = resolve(root, item.manifest);
  const raw = JSON.parse(await readFile(filename, 'utf8'));
  if (process.argv.includes('--write')) {
    for (const file of raw.files) {
      validateRelativePath(file.path);
      const bytes = await readFile(resolve(dirname(filename), file.path));
      file.size = bytes.length;
      file.sha256 = createHash('sha256').update(bytes).digest('hex');
    }
    await writeFile(filename, `${JSON.stringify(raw, null, 2)}\n`);
  }
  const manifest = validateManifest(raw, item);
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(dirname(filename), file.path));
    if (bytes.length !== file.size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
      throw new Error(`Catalog integrity mismatch: ${key}/${file.path}`);
    }
  }
}
console.log(`Catalog check passed: ${keys.size} component version(s).`);
