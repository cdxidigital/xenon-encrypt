// Simulated E2E encryption: deterministic XOR cipher keyed by chat_id + participants.
// This gives a believable "ciphertext" visible in transit while the UI shows the
// decrypted plaintext locally. NOT real cryptography.

function deriveKey(seed: string): Uint8Array {
  // FNV-1a-like hash to expand seed into 32 bytes
  const bytes = new Uint8Array(32);
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  for (let i = 0; i < 32; i++) {
    h ^= i * 0x9e3779b1;
    h = Math.imul(h, 0x01000193) >>> 0;
    bytes[i] = h & 0xff;
  }
  return bytes;
}

function b64encode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // btoa works in RN Hermes; if not, fallback manual
  if (typeof btoa === 'function') return btoa(bin);
  // fallback
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++] ?? 0;
    const b2 = bytes[i++] ?? 0;
    const b3 = bytes[i++] ?? 0;
    out += chars[b1 >> 2];
    out += chars[((b1 & 3) << 4) | (b2 >> 4)];
    out += i - 1 > bytes.length ? '=' : chars[((b2 & 15) << 2) | (b3 >> 6)];
    out += i > bytes.length ? '=' : chars[b3 & 63];
  }
  return out;
}

function b64decode(s: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = lookup[clean.charCodeAt(i)] ?? 0;
    const c2 = lookup[clean.charCodeAt(i + 1)] ?? 0;
    const c3 = lookup[clean.charCodeAt(i + 2)] ?? 0;
    const c4 = lookup[clean.charCodeAt(i + 3)] ?? 0;
    out[p++] = (c1 << 2) | (c2 >> 4);
    if (i + 2 < clean.length) out[p++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (i + 3 < clean.length) out[p++] = ((c3 & 3) << 6) | c4;
  }
  return out.slice(0, p);
}

function utf8encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) {
      out.push(0xc0 | (c >> 6));
      out.push(0x80 | (c & 0x3f));
    } else if (c < 0xd800 || c >= 0xe000) {
      out.push(0xe0 | (c >> 12));
      out.push(0x80 | ((c >> 6) & 0x3f));
      out.push(0x80 | (c & 0x3f));
    } else {
      i++;
      const c2 = s.charCodeAt(i);
      const cp = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
      out.push(0xf0 | (cp >> 18));
      out.push(0x80 | ((cp >> 12) & 0x3f));
      out.push(0x80 | ((cp >> 6) & 0x3f));
      out.push(0x80 | (cp & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function utf8decode(bytes: Uint8Array): string {
  let s = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (b < 0x80) s += String.fromCharCode(b);
    else if (b < 0xe0) s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (b < 0xf0)
      s += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f),
      );
    else {
      const cp =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
      const off = cp - 0x10000;
      s += String.fromCharCode(0xd800 + (off >> 10), 0xdc00 + (off & 0x3ff));
    }
  }
  return s;
}

export function encrypt(plaintext: string, sessionKey: string): string {
  const key = deriveKey(sessionKey);
  const data = utf8encode(plaintext);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return b64encode(out);
}

export function decrypt(ciphertext: string, sessionKey: string): string {
  try {
    const key = deriveKey(sessionKey);
    const data = b64decode(ciphertext);
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
    return utf8decode(out);
  } catch {
    return '[decrypt failed]';
  }
}

export function sessionKey(chatId: string, participants: string[]): string {
  return [...participants].sort().join('|') + '::' + chatId;
}
