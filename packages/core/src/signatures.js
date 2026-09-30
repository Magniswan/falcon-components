import { ComponentError, createCancellationToken, fail } from './errors.js';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export const SIGNATURE_PAYLOAD_LIMIT = 256 * 1024;
export const SIGNATURE_ENVELOPE_LIMIT = 384 * 1024;

export function decodeBase64(value, maximum = SIGNATURE_PAYLOAD_LIMIT) {
  if (typeof value !== 'string' || value.length > Math.ceil(maximum / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail('INVALID_SIGNATURE', '签名编码无效或超出大小限制');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const length = value.length * 3 / 4 - padding;
  if (length > maximum) fail('INVALID_SIGNATURE', '签名内容过大');
  const result = new Uint8Array(length);
  let offset = 0;
  for (let i = 0; i < value.length; i += 4) {
    const a = alphabet.indexOf(value[i]);
    const b = alphabet.indexOf(value[i + 1]);
    const c = value[i + 2] === '=' ? 0 : alphabet.indexOf(value[i + 2]);
    const d = value[i + 3] === '=' ? 0 : alphabet.indexOf(value[i + 3]);
    if (i + 4 === value.length && ((padding === 2 && (b & 15)) || (padding === 1 && (c & 3)))) {
      fail('INVALID_SIGNATURE', '签名编码不是标准 Base64');
    }
    result[offset++] = (a << 2) | (b >> 4);
    if (offset < length) result[offset++] = (b << 4) | (c >> 2);
    if (offset < length) result[offset++] = (c << 6) | d;
  }
  return result;
}

// QuickJS hosts need neither browser TextDecoder nor Node Buffer for this protocol.
export function decodeUtf8(bytes) {
  const result = [];
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i++];
    let code;
    let count;
    let minimum;
    if (first < 0x80) { code = first; count = 0; minimum = 0; }
    else if (first >= 0xc2 && first <= 0xdf) { code = first & 31; count = 1; minimum = 0x80; }
    else if (first >= 0xe0 && first <= 0xef) { code = first & 15; count = 2; minimum = 0x800; }
    else if (first >= 0xf0 && first <= 0xf4) { code = first & 7; count = 3; minimum = 0x10000; }
    else fail('INVALID_SIGNATURE', '签名内容不是有效 UTF-8');
    if (i + count > bytes.length) fail('INVALID_SIGNATURE', '签名内容 UTF-8 不完整');
    for (let j = 0; j < count; j += 1) {
      const next = bytes[i++];
      if ((next & 0xc0) !== 0x80) fail('INVALID_SIGNATURE', '签名内容 UTF-8 无效');
      code = code * 64 + (next & 63);
    }
    if (code < minimum || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) fail('INVALID_SIGNATURE', '签名内容 UTF-8 无效');
    if (code <= 0xffff) result.push(String.fromCharCode(code));
    else { code -= 0x10000; result.push(String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 1023))); }
  }
  return result.join('');
}

export function equalBytes(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}

export function createSignatureVerifier({ trustedKeys, crypto } = {}) {
  if (!crypto || typeof crypto.sha256 !== 'function' || typeof crypto.verifyEd25519 !== 'function') {
    fail('INVALID_ADAPTER', '宿主缺少 SHA-256 或 Ed25519 验签能力');
  }
  if (!Array.isArray(trustedKeys) || !trustedKeys.length || trustedKeys.length > 16) fail('INVALID_TRUST', '宿主必须固定至少一个可信公钥');
  const keys = new Map();
  const hash = crypto.sha256.bind(crypto);
  const verifySignature = crypto.verifyEd25519.bind(crypto);
  async function cryptoCall(task, token) {
    try { return await task(); }
    catch (error) {
      if (token) token.throwIfCancelled();
      if (error instanceof ComponentError) throw error;
      throw new ComponentError('CRYPTO_ERROR', '宿主密码接口无法完成验证', error);
    }
  }
  for (const record of trustedKeys) {
    if (!record || record.schemaVersion !== 1 || record.algorithm !== 'Ed25519'
      || !/^[a-f0-9]{64}$/.test(record.keyId) || typeof record.publicKey !== 'string' || record.publicKey.length > 256 || keys.has(record.keyId)) {
      fail('INVALID_TRUST', '可信公钥配置无效');
    }
    const match = /^-----BEGIN PUBLIC KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)-----END PUBLIC KEY-----\r?\n?$/.exec(record.publicKey);
    if (!match) fail('INVALID_TRUST', '可信公钥必须使用 Ed25519 SPKI PEM');
    const der = decodeBase64(match[1].replace(/[\r\n]/g, ''), 44);
    const prefix = [48, 42, 48, 5, 6, 3, 43, 101, 112, 3, 33, 0];
    if (der.length !== 44 || prefix.some((byte, index) => der[index] !== byte)) fail('INVALID_TRUST', '可信公钥不是 Ed25519 SPKI');
    keys.set(record.keyId, der);
  }
  return Object.freeze({
    async sha256(bytes) { return cryptoCall(() => hash(bytes)); },
    async verify(input, { purpose, token = createCancellationToken() } = {}) {
      token.throwIfCancelled();
      if (!['catalog', 'component-manifest', 'release'].includes(purpose)) fail('INVALID_SIGNATURE', '签名用途无效');
      if (!input) fail('SIGNATURE_REQUIRED', '组件必须提供发布者签名');
      // Capture immutable fields before the first await; never trust fetched keys.
      const envelope = Object.freeze({ schemaVersion: input.schemaVersion, algorithm: input.algorithm, keyId: input.keyId,
        purpose: input.purpose, payload: input.payload, signature: input.signature });
      if (envelope.schemaVersion !== 1 || envelope.algorithm !== 'Ed25519' || envelope.purpose !== purpose) fail('INVALID_SIGNATURE', '组件签名格式或用途无效');
      const der = keys.get(envelope.keyId);
      if (!der) fail('UNTRUSTED_KEY', '组件签名公钥不受宿主信任');
      const bytes = decodeBase64(envelope.payload);
      const signature = decodeBase64(envelope.signature, 64);
      if (signature.length !== 64) fail('INVALID_SIGNATURE', 'Ed25519 签名长度无效');
      if (await cryptoCall(() => hash(der.slice()), token) !== envelope.keyId) fail('INVALID_TRUST', '宿主可信公钥指纹不匹配');
      token.throwIfCancelled();
      const prefix = `falcon-components:${purpose}:v1\0`;
      const message = new Uint8Array(prefix.length + bytes.length);
      for (let i = 0; i < prefix.length; i += 1) message[i] = prefix.charCodeAt(i);
      message.set(bytes, prefix.length);
      if (await cryptoCall(() => verifySignature(der.slice(12), message, signature), token) !== true) fail('SIGNATURE_INVALID', '组件签名验证失败');
      token.throwIfCancelled();
      let value;
      try { value = JSON.parse(decodeUtf8(bytes)); }
      catch (error) { if (error.code) throw error; fail('INVALID_MANIFEST', '已签名内容不是有效 JSON'); }
      return { value, bytes, envelope };
    },
  });
}
