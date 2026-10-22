import { describe, expect, it } from '@jest/globals';
import { TransxactReactNativeError } from '../errors';
import { newIdempotencyKey } from '../idempotencyKey';
import { getSessionIdFromUrl, validateHostedUrl, withQueryParam } from '../url';

describe('validateHostedUrl', () => {
  it('accepts https URLs', () => {
    expect(validateHostedUrl('https://transxact.io/c/cs_1')).toBe(
      'https://transxact.io/c/cs_1'
    );
  });

  it('accepts http on loopback hosts only', () => {
    expect(validateHostedUrl('http://localhost:8787/c/cs_1')).toBeTruthy();
    expect(validateHostedUrl('http://127.0.0.1/c/cs_1')).toBeTruthy();
    expect(() => validateHostedUrl('http://transxact.io/c/cs_1')).toThrow(
      TransxactReactNativeError
    );
  });

  it('rejects custom schemes, junk and non-strings', () => {
    for (const value of [
      'myapp://pay',
      'javascript:alert(1)',
      'https://exa mple.com',
      'not a url',
      undefined,
      42,
    ]) {
      expect(() => validateHostedUrl(value)).toThrow(TransxactReactNativeError);
    }
  });

  it('is not fooled by a userinfo trick', () => {
    expect(() => validateHostedUrl('http://localhost@evil.example/')).toThrow();
  });
});

describe('withQueryParam', () => {
  it('adds, appends and replaces', () => {
    expect(withQueryParam('https://x.test/api', 'session_id', 'cs 1')).toBe(
      'https://x.test/api?session_id=cs%201'
    );
    expect(withQueryParam('https://x.test/api?a=1', 'session_id', 'cs_1')).toBe(
      'https://x.test/api?a=1&session_id=cs_1'
    );
    expect(
      withQueryParam('https://x.test/api?session_id=old&a=1#top', 'session_id', 'cs_1')
    ).toBe('https://x.test/api?a=1&session_id=cs_1#top');
  });
});

describe('getSessionIdFromUrl', () => {
  it('reads session_id from an app link', () => {
    expect(getSessionIdFromUrl('https://shop.example/return?session_id=cs_123')).toBe(
      'cs_123'
    );
    expect(getSessionIdFromUrl('myapp://return?a=1&session_id=cs_9#x')).toBe('cs_9');
  });

  it('returns null when there is none', () => {
    expect(getSessionIdFromUrl(null)).toBeNull();
    expect(getSessionIdFromUrl('https://shop.example/return')).toBeNull();
    expect(getSessionIdFromUrl('https://shop.example/return?session_id=')).toBeNull();
    expect(getSessionIdFromUrl('https://shop.example/return#session_id=cs_1')).toBeNull();
  });
});

describe('newIdempotencyKey', () => {
  it('returns distinct v4 UUIDs without needing crypto', () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(a).not.toBe(b);
  });
});
