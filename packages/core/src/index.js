export class ComponentError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'ComponentError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

export function fail(code, message) {
  throw new ComponentError(code, message);
}

export function createCancellationToken() {
  let cancelled = false;
  const handlers = new Set();
  return {
    get cancelled() { return cancelled; },
    throwIfCancelled() {
      if (cancelled) fail('CANCELLED', '操作已取消');
    },
    onCancel(handler) {
      if (cancelled) { handler(); return () => {}; }
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      for (const handler of handlers) {
        try { handler(); } catch (_) { /* Cancellation must notify every listener. */ }
      }
      handlers.clear();
    },
  };
}

export function validateId(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) {
    fail('INVALID_ID', '组件 ID 必须使用小写字母、数字和连字符');
  }
  return value;
}

export function validateVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
    || value.split('.').some((part) => !Number.isSafeInteger(Number(part)))) {
    fail('INVALID_VERSION', '请指定精确的三段组件版本，例如 0.1.0');
  }
  return value;
}

export function compareVersions(a, b) {
  const left = validateVersion(a).split('.').map(Number);
  const right = validateVersion(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

export function validateRelativePath(value) {
  if (typeof value !== 'string' || value.length > 240
    || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value)
    || value.split('/').some((part) => part === '.' || part === '..' || part.startsWith('.'))) {
    fail('INVALID_PATH', '组件文件必须使用安全的相对路径');
  }
  return value;
}

export function joinPath(root, ...parts) {
  if (typeof root !== 'string' || !root || root.includes('\0')) fail('INVALID_ROOT', '组件根目录无效');
  return `${root.replace(/\\/g, '/').replace(/\/+$/, '')}/${parts.join('/')}`;
}

export function validateRequirement(value) {
  if (!value || typeof value !== 'object') fail('INVALID_REQUIREMENT', '缺少组件需求');
  return {
    id: validateId(value.id),
    version: validateVersion(value.version),
    name: typeof value.name === 'string' ? value.name.slice(0, 120) : value.id,
  };
}

export function validateManifest(value, expected) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1) {
    fail('INVALID_MANIFEST', '组件清单格式不受支持');
  }
  const id = validateId(value.id);
  const version = validateVersion(value.version);
  if (expected && (id !== expected.id || version !== expected.version)) {
    fail('MANIFEST_MISMATCH', '组件清单与请求的组件或版本不一致');
  }
  if (!value.runtime || value.runtime.apiVersion !== 1
    || !['esm', 'quickjs-bytecode'].includes(value.runtime.format)) {
    fail('INCOMPATIBLE_RUNTIME', '组件接口或产物格式不受支持');
  }
  if (value.runtime.format === 'quickjs-bytecode'
    && (typeof value.runtime.quickjsVersion !== 'string' || typeof value.runtime.bigNum !== 'boolean')) {
    fail('INVALID_MANIFEST', '字节码清单必须声明 QuickJS 版本和 bigNum 配置');
  }
  if (!Array.isArray(value.files) || !value.files.length || value.files.length > 128) {
    fail('INVALID_MANIFEST', '组件文件数量无效');
  }
  const paths = new Set();
  let total = 0;
  const files = value.files.map((file) => {
    if (!file || typeof file !== 'object') fail('INVALID_MANIFEST', '组件文件记录无效');
    const path = validateRelativePath(file.path);
    if (path === 'manifest.json' || paths.has(path)) fail('INVALID_MANIFEST', '组件文件路径重复或占用保留名称');
    paths.add(path);
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 16 * 1024 * 1024
      || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      fail('INVALID_MANIFEST', '组件文件大小或 SHA-256 无效');
    }
    total += file.size;
    return { path, size: file.size, sha256: file.sha256 };
  });
  if (total > 64 * 1024 * 1024) fail('INVALID_MANIFEST', '组件超过当前安装大小限制');
  const entry = validateRelativePath(value.entry);
  if (!paths.has(entry)) fail('INVALID_MANIFEST', '组件入口不在文件清单中');
  // Keeping directories distinct from files avoids ambiguous installation order.
  for (const path of paths) {
    if ([...paths].some((other) => other !== path && other.startsWith(`${path}/`))) {
      fail('INVALID_MANIFEST', '组件文件路径与目录冲突');
    }
  }
  return {
    schemaVersion: 1, id, version,
    name: typeof value.name === 'string' ? value.name.slice(0, 120) : id,
    runtime: { ...value.runtime }, entry, files,
  };
}

export function assertCompatible(manifest, runtime) {
  if (!runtime || !Array.isArray(runtime.formats) || !runtime.formats.includes(manifest.runtime.format)) {
    fail('INCOMPATIBLE_RUNTIME', '当前设备不支持此组件产物');
  }
  if (manifest.runtime.format === 'quickjs-bytecode'
    && (runtime.quickjsVersion !== manifest.runtime.quickjsVersion || runtime.bigNum !== manifest.runtime.bigNum)) {
    fail('INCOMPATIBLE_RUNTIME', '组件字节码与当前 QuickJS 配置不匹配');
  }
}

export function errorMessage(error) {
  const messages = {
    CANCELLED: '已取消下载', DOWNLOAD_REQUIRED: '此功能需要下载组件',
    NETWORK_ERROR: '下载失败，请检查网络后重试', COMPONENT_NOT_FOUND: '暂时找不到需要的组件版本',
    HASH_MISMATCH: '下载内容校验失败，请重试', SIZE_MISMATCH: '下载内容不完整，请重试',
    INCOMPATIBLE_RUNTIME: '此组件暂不支持当前设备', CORRUPT_INSTALL: '本地组件损坏，请重新安装',
    STORAGE_ERROR: '无法保存组件，请检查可用空间', LOCK_TIMEOUT: '其他应用正在安装组件，请稍后重试',
    LOAD_ERROR: '组件加载失败，请重试', INVALID_MANIFEST: '组件信息无效，请联系维护者',
  };
  return messages[error && error.code] || '组件暂时不可用，请重试';
}
