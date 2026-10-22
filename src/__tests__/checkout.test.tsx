import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, Linking, Text } from 'react-native';
import { CheckoutButton, TransxactProvider, useCheckout } from '../index';

const HOSTED = 'https://transxact.io/c/cs_123';

afterEach(() => {
  jest.restoreAllMocks();
});

function mockLinking() {
  // The jest preset already mocks Linking, so spyOn hands back a mock that keeps calls from earlier tests.
  const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  spy.mockClear();
  return spy;
}

describe('useCheckout', () => {
  it('creates a Checkout Session and opens its hosted URL', async () => {
    const open = mockLinking();
    const createSession = jest.fn(async (_context: unknown) => ({ hostedUrl: HOSTED }));
    const { result } = await renderHook(() => useCheckout({ createSession }));

    await act(async () => {
      await result.current.start();
    });

    expect(createSession).toHaveBeenCalledWith({
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      signal: expect.any(AbortSignal),
    });
    expect(open).toHaveBeenCalledWith(HOSTED);
    expect(result.current.state).toBe('redirecting');
  });

  it('refuses a hosted URL that is not https', async () => {
    const open = mockLinking();
    const onError = jest.fn();
    const createSession = async () => ({ hostedUrl: 'myapp://evil' });
    const { result } = await renderHook(() =>
      useCheckout({ createSession, onError })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(open).not.toHaveBeenCalled();
    expect(result.current.state).toBe('error');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('reports a missing configuration', async () => {
    const { result } = await renderHook(() => useCheckout());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('error');
    expect(result.current.error).toMatchObject({ code: 'config_missing' });
  });

  it('reuses the Idempotency-Key on retry and drops it on reset', async () => {
    mockLinking();
    const keys: string[] = [];
    let fail = true;
    const createSession = async ({ idempotencyKey }: { idempotencyKey: string }) => {
      keys.push(idempotencyKey);
      if (fail) throw new Error('offline');
      return { hostedUrl: HOSTED };
    };
    const { result } = await renderHook(() => useCheckout({ createSession }));

    await act(async () => {
      await result.current.start();
    });
    fail = false;
    await act(async () => {
      await result.current.start();
    });
    expect(keys[1]).toBe(keys[0]);

    await act(async () => {
      result.current.reset();
    });
    await act(async () => {
      await result.current.start();
    });
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('posts the payload to createSessionUrl with an Idempotency-Key', async () => {
    mockLinking();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ hostedUrl: HOSTED }), { status: 200 })
      );
    const { result } = await renderHook(
      () =>
        useCheckout({
          createSessionUrl: 'https://shop.example/api/checkout',
          payload: { orderId: 'o1' },
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <TransxactProvider fetchInit={{ headers: { Authorization: 'Bearer t' } }}>
            {children}
          </TransxactProvider>
        ),
      }
    );

    await act(async () => {
      await result.current.start();
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://shop.example/api/checkout');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ orderId: 'o1' }));
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer t');
    expect(headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns to idle when an in-app browser redirect finishes', async () => {
    const redirect = jest.fn(async (_url: string) => undefined);
    const createSession = async () => ({ hostedUrl: HOSTED });
    const { result } = await renderHook(() =>
      useCheckout({ createSession, redirect })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(redirect).toHaveBeenCalledWith(HOSTED);
    expect(result.current.state).toBe('idle');
  });

  it('turns a failed redirect into an error', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    const createSession = async () => ({ hostedUrl: HOSTED });
    const { result } = await renderHook(() => useCheckout({ createSession }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe('error');
    expect(result.current.error?.message).toBe('no handler');
  });

  it('resets when the Customer comes back to the app', async () => {
    mockLinking();
    let listener: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _: string,
      fn: (state: string) => void
    ) => {
      listener = fn;
      return { remove: () => undefined };
    }) as never);
    const createSession = async () => ({ hostedUrl: HOSTED });
    const { result } = await renderHook(() => useCheckout({ createSession }));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('redirecting');

    await act(async () => listener?.('active')); // still foreground: not back yet
    expect(result.current.state).toBe('redirecting');

    await act(async () => listener?.('background'));
    await act(async () => listener?.('active'));
    expect(result.current.state).toBe('idle');
  });
});

describe('CheckoutButton', () => {
  it('wraps string children, starts checkout on press and disables itself', async () => {
    const open = mockLinking();
    const createSession = jest.fn(async (_context: unknown) => ({ hostedUrl: HOSTED }));
    await render(
      <CheckoutButton createSession={createSession}>Pay now</CheckoutButton>
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Pay now' }));

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(HOSTED);
    expect(screen.getByRole('button', { name: 'Pay now' })).toBeDisabled();
  });

  it('lets onPress cancel the Checkout attempt by returning false', async () => {
    const createSession = jest.fn(async (_context: unknown) => ({ hostedUrl: HOSTED }));
    await render(
      <CheckoutButton createSession={createSession} onPress={() => false}>
        <Text>Pay</Text>
      </CheckoutButton>
    );
    await fireEvent.press(screen.getByRole('button'));
    expect(createSession).not.toHaveBeenCalled();
  });
});
