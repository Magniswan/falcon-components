import { fail, validateId, validateRelativePath, validateVersion } from '@falcon-components/core';

export function validateRepository(repository) {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository)
    || repository.split('/').some((part) => part === '.' || part === '..')) fail('INVALID_SOURCE', 'GitHub 仓库必须使用 owner/repository 格式');
  return repository;
}

export function validateCatalog(value, repository) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.components) || value.components.length > 4096
    || !/^[a-f0-9]{40}$/.test(value.ref)) fail('INVALID_MANIFEST', '已签名组件目录格式无效');
  validateRepository(value.repository);
  if (repository && value.repository !== repository) fail('MANIFEST_MISMATCH', '签名目录不属于配置的更新仓库');
  const seen = new Set();
  const components = value.components.map((item) => {
    if (!item || typeof item !== 'object' || !/^[a-f0-9]{64}$/.test(item.manifestSha256)) fail('INVALID_MANIFEST', '已签名组件目录记录无效');
    const record = { id: validateId(item.id), version: validateVersion(item.version), manifest: validateRelativePath(item.manifest),
      manifestSha256: item.manifestSha256, signature: item.signature };
    const key = `${record.id}@${record.version}`;
    if (seen.has(key)) fail('INVALID_MANIFEST', '组件目录记录重复');
    seen.add(key);
    return record;
  });
  return { schemaVersion: 1, repository: value.repository, ref: value.ref, components };
}
