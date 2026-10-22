export type TransxactReactNativeErrorCode =
  | 'config_missing'
  | 'http_error'
  | 'invalid_response'
  | 'missing_session_id';

export interface TransxactReactNativeErrorOptions {
  status?: number;
  body?: unknown;
  cause?: unknown;
}

/** An error raised by the SDK itself. Errors thrown by a Merchant-supplied function pass through unchanged. */
export class TransxactReactNativeError extends Error {
  readonly code: TransxactReactNativeErrorCode;
  /** HTTP status of the Merchant backend's response, for `http_error`. */
  readonly status?: number;
  /** Parsed body of the Merchant backend's response (raw text if it wasn't JSON), for `http_error`. */
  readonly body?: unknown;
  readonly cause?: unknown;

  constructor(
    code: TransxactReactNativeErrorCode,
    message: string,
    options: TransxactReactNativeErrorOptions = {}
  ) {
    super(message);
    this.name = 'TransxactReactNativeError';
    this.code = code;
    this.status = options.status;
    this.body = options.body;
    // Assigned rather than passed to `super`: not every Hermes version supports the `cause` option.
    this.cause = options.cause;
  }
}

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  const error = new Error(String(value));
  (error as { cause?: unknown }).cause = value;
  return error;
}
