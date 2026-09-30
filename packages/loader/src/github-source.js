import { ComponentError, compareVersions, createCancellationToken, fail, SIGNATURE_ENVELOPE_LIMIT, validateId, validateManifest, validateRelativePath, validateRequirement } from '@falcon-components/core';
import { validateCatalog, validateRepository } from './catalog.js';

export function createGitHubSource({ transport, trust, repository = 'Magniswan/falcon-components', release = 'latest', ref, catalogPath } = {}) {
  validateRepository(repository);
  if (ref !== undefined || catalogPath !== undefined) fail('INVALID_SOURCE', '0.2.0 使用签名 Release 目录，请改用 release 参数');
  if (typeof release !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/.test(release) || release === '..') fail('INVALID_SOURCE', 'Release 标签无效');
  if (!transport || typeof transport.getText !== 'function' || typeof transport.getBytes !== 'function') fail('INVALID_ADAPTER', '更新源缺少网络适配器');
  if (!trust || typeof trust.verify !== 'function' || typeof trust.sha256 !== 'function') fail('INVALID_TRUST', '更新源需要宿主固定的签名验证器');
  const catalogUrl = release === 'latest'
    ? `https://github.com/${repository}/releases/latest/download/component-catalog.sig.json`
    : `https://github.com/${repository}/releases/download/${encodeURIComponent(release)}/component-catalog.sig.json`;
  async function catalog(token = createCancellationToken()) {
    token.throwIfCancelled();
    let envelope;
    try {
      const text = await transport.getText(catalogUrl, { token, maxBytes: SIGNATURE_ENVELOPE_LIMIT });
      token.throwIfCancelled();
      try { envelope = JSON.parse(text); } catch (_) { fail('INVALID_SIGNATURE', '更新源签名 JSON 无效'); }
    } catch (error) {
      if (error instanceof ComponentError) throw error;
      throw new ComponentError('NETWORK_ERROR', '无法读取 GitHub 签名目录', error);
    }
    const verified = await trust.verify(envelope, { purpose: 'catalog', token });
    validateCatalog(verified.value, repository);
    return verified.envelope;
  }
  return {
    repository, release, catalog,
    async resolve(requirement, token = createCancellationToken()) {
      const expected = validateRequirement(requirement);
      const catalogSignature = await catalog(token);
      const verified = await trust.verify(catalogSignature, { purpose: 'catalog', token });
      const index = validateCatalog(verified.value, repository);
      const item = index.components.find((record) => record.id === expected.id && record.version === expected.version);
      if (!item) fail('COMPONENT_NOT_FOUND', '更新源中没有请求的组件版本');
      const signed = await trust.verify(item.signature, { purpose: 'component-manifest', token });
      if (await trust.sha256(signed.bytes) !== item.manifestSha256) fail('MANIFEST_MISMATCH', '组件清单与签名目录不一致');
      const manifest = validateManifest(signed.value, expected);
      const directory = item.manifest.slice(0, item.manifest.lastIndexOf('/') + 1);
      const prefix = `https://raw.githubusercontent.com/${repository}/${index.ref}/`;
      return {
        manifest, manifestSignature: signed.envelope, catalogSignature,
        async download(file, options) {
          const path = validateRelativePath(directory + file.path);
          if (!manifest.files.some((item) => item.path === file.path && item.size === file.size && item.sha256 === file.sha256)) fail('INVALID_PATH', '请求的文件不属于已签名组件');
          try {
            return await transport.getBytes(prefix + path.split('/').map(encodeURIComponent).join('/'), { ...options, maxBytes: file.size });
          } catch (error) {
            if (error instanceof ComponentError) throw error;
            throw new ComponentError('NETWORK_ERROR', '无法下载组件文件', error);
          }
        },
      };
    },
    async latest(id, token = createCancellationToken()) {
      validateId(id);
      const verified = await trust.verify(await catalog(token), { purpose: 'catalog', token });
      const records = validateCatalog(verified.value, repository).components.filter((record) => record.id === id);
      if (!records.length) fail('COMPONENT_NOT_FOUND', '更新源中没有此组件');
      records.sort((a, b) => compareVersions(b.version, a.version));
      return records[0].version;
    },
  };
}
