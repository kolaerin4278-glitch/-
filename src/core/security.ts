import { SecurityError } from './errors';

const ALLOWED_PROTOCOLS = new Set(['https:', 'http:', 'tg:', 'mailto:']);

export function sanitizeExternalUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://localhost';
    const parsed = new URL(trimmed, base);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isTrustedTelegramOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (
      url.hostname === 'telegram.org' ||
      url.hostname.endsWith('.telegram.org') ||
      url.hostname === 'web.telegram.org' ||
      (typeof window !== 'undefined' && url.origin === window.location.origin)
    );
  } catch {
    return false;
  }
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function encodeUtf8Base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return bytesToBase64Url(bytes);
}

export function decodeUtf8Base64Url(encoded: string): string {
  const bytes = base64UrlToBytes(encoded);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

export async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const arr = Array.from(new Uint8Array(digest));
    return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // FNV-1a fallback для старых окружений без WebCrypto
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export async function hashPinCode(pin: string): Promise<string> {
  const normalized = pin.trim();
  if (!/^\d{4,8}$/.test(normalized)) {
    throw new SecurityError('PIN-код должен состоять из 4–8 цифр');
  }
  return sha256Hex(`hd_pin_v1:${normalized}`);
}

export interface EncryptedEnvelope {
  readonly alg: 'AES-GCM-256';
  readonly kdf: 'PBKDF2-SHA256';
  readonly iterations: number;
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
}

async function deriveAesKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new SecurityError('WebCrypto API недоступен в текущем окружении');
  }
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptStringWithPassword(
  plaintext: string,
  password: string
): Promise<EncryptedEnvelope> {
  if (password.length < 4) {
    throw new SecurityError('Пароль шифрования должен быть не короче 4 символов');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 100_000;
  const key = await deriveAesKey(password, salt, iterations);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    alg: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(encrypted))
  };
}

export async function decryptStringWithPassword(
  envelope: EncryptedEnvelope,
  password: string
): Promise<string> {
  try {
    const salt = base64UrlToBytes(envelope.salt);
    const iv = base64UrlToBytes(envelope.iv);
    const ciphertext = base64UrlToBytes(envelope.ciphertext);
    const key = await deriveAesKey(password, salt, envelope.iterations || 100_000);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new SecurityError('Неверный пароль или повреждённый зашифрованный архив');
  }
}
