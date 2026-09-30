import { ComponentError, compareVersions, fail, validateId, validateManifest, validateRelativePath, validateRequirement, validateVersion } from '@falcon-components/core';

function validateRepository(repository) {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository)
    || repository.split('/').some((part) => part === '.' || part === '..')) {
    fail('INVALID_SOURCE', 'GitHub 仓库必须使用 owner/repository 格式');
  }
  return repository;
}

export function createGitHubSource({ transport, repository = 'Magniswan/falcon-components', ref = 'main', catalogPath = 'catalog/index.json' } = {}) {
  validateRepository(repository);
  if (typeof ref !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/.test(ref) || ref === '..') {
    fail('INVALID_SOURCE', '更新源 ref 必须是简单分支、标签或提交 SHA');
  }
  validateRelativePath(catalogPath);
  if (!transport || typeof transport.getText !== 'function' || typeof transport.getBytes !== 'function') {
    fail('INVALID_ADAPTER', '更新源缺少网络适配器');
  }
  const prefix = `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(ref)}/`;
  const urlFor = (path) => prefix + validateRelativePath(path).split('/').map(encodeURIComponent).join('/');
  async function readJson(path, token) {
    token.throwIfCancelled();
    try {
      const text = await transport.getText(urlFor(path), { token, maxBytes: 256 * 1024 });
      token.throwIfCancelled();
      try { return JSON.parse(text); } catch (_) { fail('INVALID_MANIFEST', '更新源 JSON 无效'); }
    } catch (error) {
      if (error instanceof ComponentError) throw error;
      throw new ComponentError('NETWORK_ERROR', '无法读取 GitHub 更新源', error);
    }
  }
  async function list(token) {
    const value = await readJson(catalogPath, token);
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.components) || value.components.length > 4096) {
      fail('INVALID_MANIFEST', '组件目录格式无效');
    }
    const seen = new Set();
    return value.components.map((item) => {
      if (!item || typeof item !== 'object') fail('INVALID_MANIFEST', '组件目录记录无效');
      const record = { id: validateId(item.id), version: validateVersion(item.version), manifest: validateRelativePath(item.manifest) };
      const key = `${record.id}@${record.version}`;
      if (seen.has(key)) fail('INVALID_MANIFEST', '组件目录记录重复');
      seen.add(key);
      return record;
    });
  }
  return {
    repository, ref,
    async resolve(requirement, token) {
      const expected = validateRequirement(requirement);
      const item = (await list(token)).find((record) => record.id === expected.id && record.version === expected.version);
      if (!item) fail('COMPONENT_NOT_FOUND', '更新源中没有请求的组件版本');
      const manifest = validateManifest(await readJson(item.manifest, token), expected);
      const directory = item.manifest.slice(0, item.manifest.lastIndexOf('/') + 1);
      return {
        manifest,
        async download(file, options) {
          try {
            return await transport.getBytes(urlFor(directory + file.path), { ...options, maxBytes: file.size });
          } catch (error) {
            if (error instanceof ComponentError) throw error;
            throw new ComponentError('NETWORK_ERROR', '无法下载组件文件', error);
          }
        },
      };
    },
    async latest(id, token) {
      validateId(id);
      const records = (await list(token)).filter((record) => record.id === id);
      if (!records.length) fail('COMPONENT_NOT_FOUND', '更新源中没有此组件');
      records.sort((a, b) => compareVersions(b.version, a.version));
      return records[0].version;
    },
  };
}
