import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import {
  type CreateSessionSettings,
  resolveCreateSession,
} from './createSession';
import { TransxactReactNativeError, toError } from './errors';
import { newIdempotencyKey } from './idempotencyKey';
import { useTransxactConfig } from './TransxactProvider';
import { validateHostedUrl } from './url';

/** What `useCheckout` is doing right now. Never a statement about the payment. */
export type CheckoutState = 'idle' | 'creating' | 'redirecting' | 'error';

export interface UseCheckoutOptions extends CreateSessionSettings {
  /** Called with every error that moves `state` to `error`. */
  onError?: (error: Error) => void;
  /**
   * Sends the Customer to the Checkout Session's hosted URL. Defaults to `Linking.openURL`, which opens the
   * device browser. Pass your own to use an in-app browser (Safari View Controller / Chrome Custom Tabs), e.g.
   * `(url) => WebBrowser.openBrowserAsync(url)`. If it returns a promise, `state` goes back to `idle` when that
   * promise settles (for an in-app browser, when the Customer closes it) and a rejection becomes `error`.
   */
  redirect?: (hostedUrl: string) => void | Promise<unknown>;
}

export interface UseCheckoutResult {
  /** Starts a Checkout attempt, or retries the current one after an error. Ignored while one is under way. */
  start: () => Promise<void>;
  /** Abandons the Checkout attempt and returns to `idle`; the next `start` is a new Checkout attempt. */
  reset: () => void;
  state: CheckoutState;
  error: Error | undefined;
}

/**
 * What a Checkout attempt asks for, as far as the SDK can see it. A retry that asks for something else (the
 * Customer changed the cart after an error) is a new Checkout attempt and must not reuse the Idempotency-Key.
 */
function attemptFingerprint(
  createSessionUrl: string | undefined,
  payload: unknown
): string | null {
  try {
    return JSON.stringify([createSessionUrl ?? null, payload ?? null]);
  } catch {
    return null; // Not serialisable, so never provably the same attempt.
  }
}

export function useCheckout(options: UseCheckoutOptions = {}): UseCheckoutResult {
  const [state, setState] = useState<CheckoutState>('idle');
  const [error, setError] = useState<Error>();
  const config = useTransxactConfig();
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const configRef = useRef(config);
  configRef.current = config;
  // One Idempotency-Key per Checkout attempt: kept across retries, dropped by reset.
  const idempotencyKeyRef = useRef<string | null>(null);
  const fingerprintRef = useRef<string | null>(null);
  // Set synchronously so a second tap in the same frame is ignored before state re-renders.
  const busyRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  // True once the app has left the foreground since the Customer was sent to the hosted URL.
  const leftAppRef = useRef(false);
  const redirectingRef = useRef(false);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    idempotencyKeyRef.current = null;
    fingerprintRef.current = null;
    busyRef.current = false;
    redirectingRef.current = false;
    leftAppRef.current = false;
    setError(undefined);
    setState('idle');
  }, []);

  useEffect(() => {
    // A Customer who closes the browser, or switches back to the app, without paying is back with this screen
    // frozen in `redirecting`; treat that as a fresh start.
    const subscription = AppState.addEventListener('change', (next) => {
      if (!redirectingRef.current) return;
      if (next !== 'active') {
        leftAppRef.current = true;
      } else if (leftAppRef.current) {
        reset();
      }
    });
    return () => {
      subscription.remove();
      controllerRef.current?.abort();
    };
  }, [reset]);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    const { onError, redirect, payload } = optionsRef.current;
    const fingerprint = attemptFingerprint(
      optionsRef.current.createSessionUrl ?? configRef.current.createSessionUrl,
      payload
    );
    if (
      idempotencyKeyRef.current === null ||
      fingerprint === null ||
      fingerprint !== fingerprintRef.current
    ) {
      idempotencyKeyRef.current = newIdempotencyKey();
      fingerprintRef.current = fingerprint;
    }
    const idempotencyKey = idempotencyKeyRef.current;
    const createSession = resolveCreateSession(
      optionsRef.current,
      configRef.current
    );
    setError(undefined);
    setState('creating');
    try {
      if (!createSession) {
        throw new TransxactReactNativeError(
          'config_missing',
          'No way to reach the Merchant backend: pass createSession or createSessionUrl, as a prop or on TransxactProvider.'
        );
      }
      const created = await createSession({
        idempotencyKey,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const hostedUrl = validateHostedUrl(created?.hostedUrl);
      leftAppRef.current = false;
      redirectingRef.current = true;
      setState('redirecting');
      if (redirect) {
        const result = redirect(hostedUrl);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          await result;
          if (controller.signal.aborted) return;
          // The in-app browser was closed (or the redirect finished); the Customer is back on this screen.
          reset();
        }
      } else {
        await Linking.openURL(hostedUrl);
      }
    } catch (caught) {
      if (controller.signal.aborted) return;
      const failure = toError(caught);
      busyRef.current = false;
      redirectingRef.current = false;
      setError(failure);
      setState('error');
      onError?.(failure);
    }
  }, [reset]);

  return { start, reset, state, error };
}
