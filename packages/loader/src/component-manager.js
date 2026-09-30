import { ComponentError, assertCompatible, compareVersions, createCancellationToken, equalBytes, fail, joinPath, validateManifest, validateRequirement } from '@falcon-components/core';
import { validateCatalog } from './catalog.js';

export function createComponentManager({ root, storage, source, runtime, trust } = {}) {
  joinPath(root, 'probe');
  const storageMethods = ['readJson', 'readBytes', 'writeJson', 'writeBytes', 'mkdir', 'rename', 'removeTree', 'sha256', 'withLock'];
  if (!storage || storageMethods.some((name) => typeof storage[name] !== 'function')
    || !source || typeof source.resolve !== 'function' || typeof source.catalog !== 'function'
    || !runtime || typeof runtime.importModule !== 'function') {
    fail('INVALID_ADAPTER', '组件管理器缺少存储、更新源或加载适配器');
  }
  if (!trust || typeof trust.verify !== 'function') fail('INVALID_TRUST', '组件管理器必须使用宿主可信公钥验签');
  let sequence = 0;
  const directoryFor = ({ id, version }) => joinPath(root, id, version);
  async function inspect(requirement, token = createCancellationToken()) {
    const expected = validateRequirement(requirement);
    token.throwIfCancelled();
    const directory = directoryFor(expected);
    const signature = await storage.readJson(joinPath(directory, 'manifest.json.sig.json'));
    const raw = await storage.readBytes(joinPath(directory, 'manifest.json'));
    token.throwIfCancelled();
    if (raw === null && signature === null) return null;
    const verified = await trust.verify(signature, { purpose: 'component-manifest', token });
    if (!equalBytes(raw, verified.bytes)) fail('CORRUPT_INSTALL', '本地清单与签名原始内容不一致');
    let manifest;
    try { manifest = validateManifest(verified.value, expected); }
    catch (error) { throw new ComponentError('CORRUPT_INSTALL', '本地组件清单损坏', error); }
    assertCompatible(manifest, runtime);
    for (const file of manifest.files) {
      token.throwIfCancelled();
      const bytes = await storage.readBytes(joinPath(directory, file.path));
      if (!(bytes instanceof Uint8Array) || bytes.length !== file.size || await storage.sha256(bytes) !== file.sha256) {
        fail('CORRUPT_INSTALL', '本地组件文件损坏或缺失');
      }
    }
    token.throwIfCancelled();
    return { directory, manifest };
  }
  async function ensure(requirement, { token = createCancellationToken(), requestDownload, onProgress = () => {} } = {}) {
    const expected = validateRequirement(requirement);
    const installed = await inspect(expected, token);
    if (installed) return installed;
    if (typeof requestDownload !== 'function') fail('DOWNLOAD_REQUIRED', '组件未安装，需要前台确认下载');
    const approved = await requestDownload(expected);
    token.throwIfCancelled();
    if (approved !== true) fail('CANCELLED', '用户取消组件下载');
    // Confirm before locking; a foreground prompt must not hold a cross-app installation lock.
    return storage.withLock(`${expected.id}@${expected.version}`, async () => {
      const existing = await inspect(expected, token);
      if (existing) return existing;
      token.throwIfCancelled();
      const resolved = await source.resolve(expected, token);
      // Verify independently: a custom source cannot turn unsigned manifests into trusted installs.
      const index = validateCatalog((await trust.verify(resolved.catalogSignature, { purpose: 'catalog', token })).value, source.repository);
      const record = index.components.find((item) => item.id === expected.id && item.version === expected.version);
      if (!record) fail('COMPONENT_NOT_FOUND', '签名目录中没有请求的组件');
      const signed = await trust.verify(resolved.manifestSignature, { purpose: 'component-manifest', token });
      if (await storage.sha256(signed.bytes) !== record.manifestSha256) fail('MANIFEST_MISMATCH', '组件清单不属于已签名目录');
      const manifest = validateManifest(signed.value, expected);
      assertCompatible(manifest, runtime);
      const stage = joinPath(root, '.staging', `${expected.id}-${expected.version}-${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2)}`);
      const directory = directoryFor(expected);
      let committed = false;
      let primaryError;
      try {
        await storage.mkdir(stage);
        const total = manifest.files.reduce((sum, file) => sum + file.size, 0);
        let completed = 0;
        const emit = (received, file) => {
          token.throwIfCancelled();
          onProgress({ id: expected.id, version: expected.version, name: manifest.name, received, total, file });
        };
        emit(0, '');
        for (const file of manifest.files) {
          token.throwIfCancelled();
          const bytes = await resolved.download(file, { token, onProgress: (received) => emit(completed + Math.min(file.size, Math.max(0, received)), file.path) });
          token.throwIfCancelled();
          if (!(bytes instanceof Uint8Array) || bytes.length !== file.size) fail('SIZE_MISMATCH', '下载文件大小不匹配');
          if (await storage.sha256(bytes) !== file.sha256) fail('HASH_MISMATCH', '下载文件 SHA-256 不匹配');
          token.throwIfCancelled();
          await storage.writeBytes(joinPath(stage, file.path), bytes);
          completed += bytes.length;
          emit(completed, file.path);
        }
        await storage.writeBytes(joinPath(stage, 'manifest.json'), signed.bytes);
        await storage.writeJson(joinPath(stage, 'manifest.json.sig.json'), signed.envelope);
        token.throwIfCancelled();
        await storage.mkdir(joinPath(root, expected.id));
        // Adapter must refuse to replace an existing version. Publish only complete directories.
        await storage.rename(stage, directory);
        committed = true;
        token.throwIfCancelled();
        return { directory, manifest };
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        if (!committed) {
          try { await storage.removeTree(stage); }
          catch (error) {
            if (!primaryError) throw error;
            // Preserve the operational cause; callers can inspect a cleanup failure as well.
            primaryError.cleanupError = error;
          }
        }
      }
    }, { token });
  }
  return {
    root, inspect, ensure,
    async load(requirement, { context = {}, token = createCancellationToken(), ...options } = {}) {
      await ensure(requirement, { ...options, token });
      // Re-read disk after publishing, immediately before the host module loader is invoked.
      const installed = await inspect(requirement, token);
      if (!installed) fail('CORRUPT_INSTALL', '组件在加载前消失');
      token.throwIfCancelled();
      let instance;
      try {
        const module = await runtime.importModule(joinPath(installed.directory, installed.manifest.entry), { manifest: installed.manifest, token });
        token.throwIfCancelled();
        if (!module || module.apiVersion !== 1 || typeof module.createComponent !== 'function') {
          fail('LOAD_ERROR', '组件没有提供约定的创建接口');
        }
        instance = await module.createComponent({ ...context, component: { directory: installed.directory, manifest: installed.manifest } });
        if (!instance || typeof instance.dispose !== 'function') fail('LOAD_ERROR', '组件实例缺少 dispose 接口');
        token.throwIfCancelled();
      } catch (error) {
        if (instance && typeof instance.dispose === 'function') {
          try { await instance.dispose(); }
          catch (cleanupError) { error.cleanupError = cleanupError; }
        }
        if (error instanceof ComponentError) throw error;
        throw new ComponentError('LOAD_ERROR', '组件加载失败', error);
      }
      let disposed = false;
      return {
        ...installed, instance,
        async dispose() {
          if (disposed) return;
          disposed = true;
          await instance.dispose();
        },
      };
    },
    async checkUpdate(requirement, { token = createCancellationToken() } = {}) {
      const expected = validateRequirement(requirement);
      const verified = await trust.verify(await source.catalog(token), { purpose: 'catalog', token });
      const records = validateCatalog(verified.value, source.repository).components.filter((item) => item.id === expected.id);
      if (!records.length) fail('COMPONENT_NOT_FOUND', '签名目录中没有此组件');
      records.sort((left, right) => compareVersions(right.version, left.version));
      const latest = records[0].version;
      token.throwIfCancelled();
      return { id: expected.id, current: expected.version, latest, available: compareVersions(latest, expected.version) > 0 };
    },
  };
}
