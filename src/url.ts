import { TransxactReactNativeError } from './errors';

// React Native's built-in `URL` is incomplete (`searchParams.set` throws), so URLs are handled as strings.
const URL_PARTS = /^([a-z][a-z0-9+.-]*):\/\/(?:[^/?#@]*@)?(\[[^\]]*\]|[^/?#:]*)(?::\d+)?/i;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Only an https URL (or http on a loopback host, for local development) may receive the Customer, so a
 * compromised or misconfigured Merchant backend can't turn the pay button into an open redirect.
 */
export function validateHostedUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TransxactReactNativeError(
      'invalid_response',
      "The Merchant backend's response has no hostedUrl string."
    );
  }
  const parts = URL_PARTS.exec(value);
  if (!parts || /\s/.test(value)) {
    throw new TransxactReactNativeError(
      'invalid_response',
      `hostedUrl is not a valid URL: ${value}`
    );
  }
  const protocol = (parts[1] ?? '').toLowerCase();
  const hostname = (parts[2] ?? '').toLowerCase();
  const allowed =
    protocol === 'https' ||
    (protocol === 'http' &&
      (LOOPBACK_HOSTS.has(hostname) || hostname.endsWith('.localhost')));
  if (!allowed) {
    throw new TransxactReactNativeError(
      'invalid_response',
      `hostedUrl must be an https URL: ${value}`
    );
  }
  return value;
}

/** Adds (or replaces) one query parameter on a URL, ahead of any `#fragment`. */
export function withQueryParam(url: string, name: string, value: string): string {
  const hashAt = url.indexOf('#');
  const fragment = hashAt === -1 ? '' : url.slice(hashAt);
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = base.indexOf('?');
  const path = queryAt === -1 ? base : base.slice(0, queryAt);
  const kept = (queryAt === -1 ? '' : base.slice(queryAt + 1))
    .split('&')
    .filter((pair) => pair !== '' && pair.split('=')[0] !== name);
  kept.push(`${name}=${encodeURIComponent(value)}`);
  return `${path}?${kept.join('&')}${fragment}`;
}

/**
 * The Checkout Session id Transxact appends as `session_id` to the success and cancel URLs, or `null`. Use it
 * on the URL your app was opened with, if your router doesn't give you query parameters.
 */
export function getSessionIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const queryAt = url.indexOf('?');
  if (queryAt === -1) return null;
  const hashAt = url.indexOf('#', queryAt);
  const query = url.slice(queryAt + 1, hashAt === -1 ? undefined : hashAt);
  for (const pair of query.split('&')) {
    const equals = pair.indexOf('=');
    const name = equals === -1 ? pair : pair.slice(0, equals);
    if (name !== 'session_id') continue;
    const raw = equals === -1 ? '' : pair.slice(equals + 1);
    try {
      return decodeURIComponent(raw.replace(/\+/g, ' ')) || null;
    } catch {
      return raw || null;
    }
  }
  return null;
}
