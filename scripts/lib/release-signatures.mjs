import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export const purposes = ['catalog', 'component-manifest', 'release'];
export function validateReleasePath(path) {
  if (typeof path !== 'string' || !path || path.length > 1024
    || path.split('/').some((part) => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..' || part === '.git')) {
    throw new Error('Invalid release path');
  }
  return path;
}
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
export function trustedPublicKey(record) {
  if (!record || record.schemaVersion !== 1 || record.algorithm !== 'Ed25519'
    || typeof record.publicKey !== 'string' || !/^[a-f0-9]{64}$/.test(record.keyId)) {
    throw new Error('Invalid trusted public key');
  }
  const key = createPublicKey(record.publicKey);
  if (key.asymmetricKeyType !== 'ed25519'
    || sha256(key.export({ type: 'spki', format: 'der' })) !== record.keyId) {
    throw new Error('Trusted public key fingerprint mismatch');
  }
  return key;
}
function signedMessage(bytes, purpose) {
  if (!purposes.includes(purpose)) throw new Error('Unsupported signature purpose');
  return Buffer.concat([Buffer.from(`falcon-components:${purpose}:v1\0`, 'utf8'), bytes]);
}
function decodeBase64(value, maxBytes) {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Invalid signature encoding');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > maxBytes || bytes.toString('base64') !== value) throw new Error('Invalid signature encoding');
  return bytes;
}
export function signPayload(bytes, { privateKeyPem, trustedKey, purpose }) {
  const publicKey = trustedPublicKey(trustedKey);
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'ed25519'
    || !createPublicKey(privateKey).export({ type: 'spki', format: 'der' })
      .equals(publicKey.export({ type: 'spki', format: 'der' }))) {
    throw new Error('Signing private key does not match the trusted public key');
  }
  if (!Buffer.isBuffer(bytes) || bytes.length > 256 * 1024) throw new Error('Invalid signing payload size');
  return {
    schemaVersion: 1, algorithm: 'Ed25519', keyId: trustedKey.keyId, purpose,
    payload: bytes.toString('base64'),
    signature: sign(null, signedMessage(bytes, purpose), privateKey).toString('base64'),
  };
}
export function verifyPayload(envelope, { trustedKey, purpose }) {
  const publicKey = trustedPublicKey(trustedKey);
  if (!envelope || envelope.schemaVersion !== 1 || envelope.algorithm !== 'Ed25519'
    || envelope.keyId !== trustedKey.keyId || envelope.purpose !== purpose) {
    throw new Error('Untrusted signature envelope');
  }
  const bytes = decodeBase64(envelope.payload, 256 * 1024);
  const signature = decodeBase64(envelope.signature, 64);
  if (signature.length !== 64 || !verify(null, signedMessage(bytes, purpose), publicKey, signature)) {
    throw new Error('Signature verification failed');
  }
  return bytes;
}
