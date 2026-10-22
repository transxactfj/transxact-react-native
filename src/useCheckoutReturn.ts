import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { TransxactReactNativeError, toError } from './errors';
import {
  type RetrieveSessionSettings,
  resolveRetrieveSession,
} from './retrieveSession';
import { useTransxactConfig } from './TransxactProvider';
import type {
  CheckoutSessionLike,
  CheckoutSessionStatus,
  PollingOptions,
} from './types';
import { getSessionIdFromUrl } from './url';

/** What `useCheckoutReturn` is doing right now. The payment itself is `session.status`. */
export type CheckoutReturnState =
  | 'idle'
  | 'loading'
  | 'polling'
  | 'settled'
  | 'timed_out'
  | 'error'
  | 'missing';

export interface UseCheckoutReturnOptions<
  S extends CheckoutSessionLike = CheckoutSessionLike,
> extends RetrieveSessionSettings<S> {
  /**
   * The Checkout Session id. Pass it from your router (`useLocalSearchParams`, `route.params`) when you can:
   * `null` means "there is none" and shows `missing`. When omitted, the SDK reads `session_id` from the link
   * that opened the app, or from the next link the app receives.
   */
  sessionId?: string | null;
  polling?: PollingOptions;
}

export interface UseCheckoutReturnResult<
  S extends CheckoutSessionLike = CheckoutSessionLike,
> {
  state: CheckoutReturnState;
  /** The Checkout Session as the Merchant backend last reported it. */
  session: S | undefined;
  error: Error | undefined;
  /** Starts the lookup again, e.g. after `error` or `timed_out`. */
  refresh: () => void;
}

const DEFAULT_POLLING: Required<PollingOptions> = {
  intervalMs: 1500,
  maxIntervalMs: 8000,
  timeoutMs: 60_000,
};
const STATUSES: ReadonlySet<string> = new Set<CheckoutSessionStatus>([
  'pending',
  'succeeded',
  'failed',
  'cancelled',
]);

function validateSession<S extends CheckoutSessionLike>(value: unknown): S {
  const status =
    typeof value === 'object' && value !== null
      ? (value as { status?: unknown }).status
      : undefined;
  if (typeof status !== 'string' || !STATUSES.has(status)) {
    throw new TransxactReactNativeError(
      'invalid_response',
      "The Merchant backend's response is not a Checkout Session with a valid status."
    );
  }
  return value as S;
}

/** Later layers win field by field; an `undefined` field never erases an earlier value. */
function mergePolling(
  ...layers: Array<PollingOptions | undefined>
): Required<PollingOptions> {
  const merged = { ...DEFAULT_POLLING };
  for (const layer of layers) {
    for (const key of Object.keys(merged) as Array<keyof PollingOptions>) {
      const value = layer?.[key];
      if (value !== undefined) merged[key] = value;
    }
  }
  return merged;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/**
 * The `session_id` on the link that opened the app, or on the latest link it received. `undefined` until the
 * launch link has been read, then a string or `null`.
 */
function useLinkedSessionId(enabled: boolean): string | null | undefined {
  const [linked, setLinked] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    Linking.getInitialURL().then(
      (url) => {
        if (active) setLinked((current) => current ?? getSessionIdFromUrl(url));
      },
      () => {
        if (active) setLinked((current) => current ?? null);
      }
    );
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const id = getSessionIdFromUrl(url);
      if (active && id) setLinked(id);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [enabled]);
  return linked;
}

/**
 * Confirms, on the Return screen, what actually happened to a Checkout Session. Arriving on the Return screen
 * proves nothing — both the success and cancel URLs get `session_id` — so the Merchant backend is always asked.
 */
export function useCheckoutReturn<S extends CheckoutSessionLike = CheckoutSessionLike>(
  options: UseCheckoutReturnOptions<S> = {}
): UseCheckoutReturnResult<S> {
  const [state, setState] = useState<CheckoutReturnState>('idle');
  const [session, setSession] = useState<S>();
  const [error, setError] = useState<Error>();
  const [run, setRun] = useState(0);
  const config = useTransxactConfig();
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const configRef = useRef(config);
  configRef.current = config;
  const explicitSessionId = options.sessionId;
  const linkedSessionId = useLinkedSessionId(explicitSessionId === undefined);
  const sessionId =
    explicitSessionId !== undefined ? explicitSessionId : linkedSessionId;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `run` is the refresh trigger; bumping it restarts the lookup.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setSession(undefined);
    setError(undefined);

    if (sessionId === undefined) {
      // Still reading the link that opened the app.
      setState('idle');
      return () => controller.abort();
    }
    if (!sessionId) {
      setState('missing');
      return () => controller.abort();
    }

    const lookup = async () => {
      const retrieveSession = resolveRetrieveSession(
        optionsRef.current,
        configRef.current
      );
      const { intervalMs, maxIntervalMs, timeoutMs } = mergePolling(
        configRef.current.polling,
        optionsRef.current.polling
      );
      setState('loading');
      const startedAt = Date.now();
      let delay = intervalMs;
      try {
        if (!retrieveSession) {
          throw new TransxactReactNativeError(
            'config_missing',
            'No way to reach the Merchant backend: pass retrieveSession or retrieveSessionUrl, as a prop or on TransxactProvider.'
          );
        }
        for (;;) {
          const retrieved = validateSession<S>(
            await retrieveSession(sessionId, { signal })
          );
          if (signal.aborted) return;
          setSession(retrieved);
          if (retrieved.status !== 'pending') {
            setState('settled');
            return;
          }
          const remaining = timeoutMs - (Date.now() - startedAt);
          if (remaining <= 0) {
            setState('timed_out');
            return;
          }
          setState('polling');
          await wait(Math.min(delay, remaining), signal);
          if (signal.aborted) return;
          delay = Math.min(delay * 2, maxIntervalMs);
        }
      } catch (caught) {
        if (signal.aborted) return;
        setError(toError(caught));
        setState('error');
      }
    };
    void lookup();
    return () => controller.abort();
  }, [sessionId, run]);

  const refresh = useCallback(() => {
    setState('loading');
    setRun((current) => current + 1);
  }, []);

  return { state, session, error, refresh };
}
