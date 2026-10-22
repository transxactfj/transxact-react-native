import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { type CheckoutSessionStatus, useCheckoutReturn } from '../index';

function retrieveSequence(...statuses: CheckoutSessionStatus[]) {
  let call = 0;
  return jest.fn(async (_id: string, _context: { signal: AbortSignal }) => {
    const status = statuses[Math.min(call, statuses.length - 1)] as CheckoutSessionStatus;
    call += 1;
    return { id: 'cs_123', status };
  });
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useCheckoutReturn', () => {
  it('confirms a succeeded Checkout Session through the Merchant backend', async () => {
    const retrieveSession = retrieveSequence('succeeded');
    const { result } = await renderHook(() =>
      useCheckoutReturn({ sessionId: 'cs_123', retrieveSession })
    );
    await advance(0);

    expect(retrieveSession).toHaveBeenCalledWith(
      'cs_123',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(result.current.state).toBe('settled');
    expect(result.current.session?.status).toBe('succeeded');
  });

  it('polls while pending, then settles', async () => {
    const retrieveSession = retrieveSequence('pending', 'pending', 'failed');
    const { result } = await renderHook(() =>
      useCheckoutReturn({ sessionId: 'cs_123', retrieveSession })
    );
    await advance(0);
    expect(result.current.state).toBe('polling');

    await advance(1500);
    expect(retrieveSession).toHaveBeenCalledTimes(2);
    await advance(3000); // interval doubled
    expect(retrieveSession).toHaveBeenCalledTimes(3);
    expect(result.current.state).toBe('settled');
    expect(result.current.session?.status).toBe('failed');
  });

  it('times out while still pending', async () => {
    const retrieveSession = retrieveSequence('pending');
    const { result } = await renderHook(() =>
      useCheckoutReturn({
        sessionId: 'cs_123',
        retrieveSession,
        polling: { intervalMs: 100, maxIntervalMs: 100, timeoutMs: 350 },
      })
    );
    await advance(1000);
    expect(result.current.state).toBe('timed_out');
    expect(result.current.session?.status).toBe('pending');
  });

  it('reports missing when the router gives no session id', async () => {
    const retrieveSession = retrieveSequence('succeeded');
    const { result } = await renderHook(() =>
      useCheckoutReturn({ sessionId: null, retrieveSession })
    );
    await advance(0);
    expect(result.current.state).toBe('missing');
    expect(retrieveSession).not.toHaveBeenCalled();
  });

  it('rejects a response without a valid status', async () => {
    const retrieveSession = jest.fn(
      async (_id: string, _context: { signal: AbortSignal }) =>
        ({ id: 'cs_123', status: 'paid' }) as never
    );
    const { result } = await renderHook(() =>
      useCheckoutReturn({ sessionId: 'cs_123', retrieveSession })
    );
    await advance(0);
    expect(result.current.state).toBe('error');
    expect(result.current.error).toMatchObject({ code: 'invalid_response' });
  });

  it('refresh looks the Checkout Session up again after an error', async () => {
    let fail = true;
    const retrieveSession = jest.fn(
      async (_id: string, _context: { signal: AbortSignal }) => {
        if (fail) throw new Error('offline');
        return { id: 'cs_123', status: 'succeeded' as const };
      }
    );
    const { result } = await renderHook(() =>
      useCheckoutReturn({ sessionId: 'cs_123', retrieveSession })
    );
    await advance(0);
    expect(result.current.state).toBe('error');

    fail = false;
    await act(async () => result.current.refresh());
    await advance(0);
    expect(result.current.state).toBe('settled');
  });

  it('reads session_id from the link that opened the app', async () => {
    jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue('https://shop.example/checkout/return?session_id=cs_123');
    const retrieveSession = retrieveSequence('succeeded');
    const { result } = await renderHook(() => useCheckoutReturn({ retrieveSession }));
    await advance(0);
    expect(retrieveSession).toHaveBeenCalledWith('cs_123', expect.anything());
    expect(result.current.state).toBe('settled');
  });

  it('picks up a link received while the app is open', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    let onUrl: ((event: { url: string }) => void) | undefined;
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((
      _: string,
      fn: (event: { url: string }) => void
    ) => {
      onUrl = fn;
      return { remove: () => undefined };
    }) as never);
    const retrieveSession = retrieveSequence('succeeded');
    const { result } = await renderHook(() => useCheckoutReturn({ retrieveSession }));
    await advance(0);
    expect(result.current.state).toBe('missing');

    await act(async () =>
      onUrl?.({ url: 'https://shop.example/return?session_id=cs_123' })
    );
    await advance(0);
    expect(result.current.state).toBe('settled');
  });

  it('builds the lookup URL itself with retrieveSessionUrl', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'cs_123', status: 'succeeded' }), {
          status: 200,
        })
      );
    const { result } = await renderHook(() =>
      useCheckoutReturn({
        sessionId: 'cs_123',
        retrieveSessionUrl: 'https://shop.example/api/checkout',
      })
    );
    await advance(0);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://shop.example/api/checkout?session_id=cs_123'
    );
    expect(result.current.state).toBe('settled');
  });
});
