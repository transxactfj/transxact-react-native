/**
 * A v4 UUID. React Native has no `crypto` until the app installs a polyfill, so use it when present and
 * fall back to `Math.random`. An Idempotency-Key only has to be unique per Checkout attempt, not secret.
 */
export function newIdempotencyKey(): string {
  const { crypto } = globalThis as {
    crypto?: {
      randomUUID?: () => string;
      getRandomValues?: (bytes: Uint8Array) => Uint8Array;
    };
  };
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto?.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
