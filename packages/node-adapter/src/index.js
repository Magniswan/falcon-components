import { mkdir, lstat, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, relative, sep, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { ComponentError, fail, createSignatureVerifier, SIGNATURE_ENVELOPE_LIMIT } from '@falcon-components/core';

export function createNodeCrypto() {
  return {
    async sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); },
    async verifyEd25519(publicKey, message, signature) {
      const prefix = Buffer.from([48, 42, 48, 5, 6, 3, 43, 101, 112, 3, 33, 0]);
      const key = createPublicKey({ key: Buffer.concat([prefix, Buffer.from(publicKey)]), type: 'spki', format: 'der' });
      return verify(null, message, key, signature);
    },
  };
}

export function createNodeSignatureVerifier({ trustedKeys } = {}) {
  return createSignatureVerifier({ trustedKeys, crypto: createNodeCrypto() });
}

export function createNodeStorage({ root, lockTimeoutMs = 10000 } = {}) {
  if (typeof root !== 'string' || !root) fail('INVALID_ROOT', '请指定组件根目录');
  const absoluteRoot = resolve(root);
  async function checkedPath(value) {
    const absolute = resolve(value);
    const suffix = relative(absoluteRoot, absolute);
    if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith(`..${sep}`) || resolve(absoluteRoot, suffix) !== absolute) {
      fail('INVALID_PATH', '存储路径越过组件根目录');
    }
    const parts = suffix ? suffix.split(sep) : [];
    let current = absoluteRoot;
    for (let i = 0; i <= parts.length; i += 1) {
      try {
        const stat = await lstat(current);
        if (stat.isSymbolicLink()) fail('INVALID_PATH', '组件目录不允许符号链接');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (i < parts.length) current = resolve(current, parts[i]);
    }
    return absolute;
  }
  async function storageOperation(task) {
    try { return await task(); }
    catch (error) {
      if (error instanceof ComponentError) throw error;
      throw new ComponentError('STORAGE_ERROR', '组件文件操作失败', error);
    }
  }
  const storage = {
    root: absoluteRoot.replace(/\\/g, '/'),
    async readBytes(path) {
      return storageOperation(async () => {
        const filename = await checkedPath(path);
        try {
          const stat = await lstat(filename);
          if (!stat.isFile() || stat.size > 16 * 1024 * 1024) fail('CORRUPT_INSTALL', '本地组件文件无效或过大');
          return new Uint8Array(await readFile(filename));
        } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      });
    },
    async readJson(path) {
      return storageOperation(async () => {
        const filename = await checkedPath(path);
        try {
          const stat = await lstat(filename);
          if (!stat.isFile() || stat.size > (filename.endsWith('.sig.json') ? SIGNATURE_ENVELOPE_LIMIT : 256 * 1024)) fail('CORRUPT_INSTALL', '本地组件清单无效或过大');
          const text = await readFile(filename, 'utf8');
          try { return JSON.parse(text); } catch (_) { fail('CORRUPT_INSTALL', '本地组件清单 JSON 损坏'); }
        } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      });
    },
    async mkdir(path) { return storageOperation(async () => mkdir(await checkedPath(path), { recursive: true })); },
    async writeBytes(path, bytes) {
      return storageOperation(async () => {
        const filename = await checkedPath(path);
        await mkdir(dirname(filename), { recursive: true });
        await writeFile(filename, bytes, { flag: 'wx' });
      });
    },
    async writeJson(path, value) {
      await storage.writeBytes(path, new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
    },
    async rename(from, to) {
      return storageOperation(async () => {
        const source = await checkedPath(from);
        const destination = await checkedPath(to);
        try { await lstat(destination); fail('STORAGE_ERROR', '目标组件版本已存在，不能覆盖'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        await rename(source, destination);
      });
    },
    async removeTree(path) {
      return storageOperation(async () => {
        const absolute = await checkedPath(path);
        const parts = relative(absoluteRoot, absolute).split(sep);
        if (parts.length !== 2 || !['.staging', '.locks'].includes(parts[0]) || !parts[1]) {
          fail('INVALID_PATH', '仅允许清理组件根目录中的单个临时安装或锁目录');
        }
        await rm(absolute, { recursive: true, force: true });
      });
    },
    async sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); },
    async withLock(key, task, { token } = {}) {
      if (!/^[a-z][a-z0-9-]{0,63}@\d+\.\d+\.\d+$/.test(key)) fail('INVALID_PATH', '安装锁名称无效');
      const lock = await checkedPath(resolve(absoluteRoot, '.locks', key));
      await storage.mkdir(resolve(absoluteRoot, '.locks'));
      const started = Date.now();
      while (true) {
        token.throwIfCancelled();
        try { await mkdir(lock); break; }
        catch (error) {
          if (error.code !== 'EEXIST') throw new ComponentError('STORAGE_ERROR', '无法创建组件安装锁', error);
          if (Date.now() - started >= lockTimeoutMs) fail('LOCK_TIMEOUT', '等待组件安装锁超时');
          await new Promise((accept) => setTimeout(accept, 20));
        }
      }
      let primaryError;
      try {
        await writeFile(resolve(lock, 'owner.json'), JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), { flag: 'wx' });
        token.throwIfCancelled();
        return await task();
      } catch (error) { primaryError = error; throw error; }
      finally {
        try { await storage.removeTree(lock); }
        catch (error) { if (!primaryError) throw error; primaryError.cleanupError = error; }
      }
    },
  };
  return storage;
}

export function createNodeTransport({ timeoutMs = 20000 } = {}) {
  async function getBytes(url, { token, maxBytes, onProgress = () => {} }) {
    token.throwIfCancelled();
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) fail('INVALID_ADAPTER', '网络读取必须指定大小上限');
    const abort = new AbortController();
    const off = token.onCancel(() => abort.abort());
    const timeout = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw new ComponentError(response.status === 404 ? 'COMPONENT_NOT_FOUND' : 'NETWORK_ERROR', `更新源返回 HTTP ${response.status}`);
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) fail('SIZE_MISMATCH', '网络内容超过大小限制');
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      while (true) {
        token.throwIfCancelled();
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) { abort.abort(); fail('SIZE_MISMATCH', '网络内容超过大小限制'); }
        chunks.push(value);
        onProgress(total);
      }
      token.throwIfCancelled();
      const result = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      return result;
    } catch (error) {
      token.throwIfCancelled();
      if (error instanceof ComponentError) throw error;
      throw new ComponentError('NETWORK_ERROR', '无法连接组件更新源', error);
    } finally { clearTimeout(timeout); off(); }
  }
  return {
    getBytes,
    async getText(url, options) { return new TextDecoder('utf-8', { fatal: true }).decode(await getBytes(url, options)); },
  };
}

export function createNodeRuntime() {
  return {
    formats: ['esm'],
    async importModule(path, { token }) {
      token.throwIfCancelled();
      return import(pathToFileURL(resolve(path)).href);
    },
  };
}
