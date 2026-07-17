import { sleep } from "@/lib/utils";

export interface RetryOptions {
  /** Max attempts including the first. Default 5. */
  retries?: number;
  /** Base delay in ms for exponential backoff. Default 500. */
  baseDelayMs?: number;
  /** Max delay cap in ms. Default 30_000. */
  maxDelayMs?: number;
  /** Add random jitter (0..1 * delay). Default true. */
  jitter?: boolean;
  /** Decide whether an error is retryable. Default: retry network/5xx/429. */
  isRetryable?: (error: unknown) => boolean;
  /** Called before each retry (for logging/metrics). */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Optional label for error messages. */
  label?: string;
}

/** HTTP-ish error shape used by our API clients. */
export interface HttpError extends Error {
  status?: number;
}

export function defaultIsRetryable(error: unknown): boolean {
  const err = error as HttpError & { code?: string };
  // Network-level errors from fetch/undici/node
  const retryableCodes = [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ENOTFOUND",
    "EPIPE",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_SOCKET",
  ];
  if (err?.code && retryableCodes.includes(err.code)) return true;
  const status = err?.status;
  if (typeof status === "number") {
    return status === 408 || status === 429 || (status >= 500 && status < 600);
  }
  // Unknown errors: retry conservatively for transient fetch failures only.
  return err instanceof TypeError && /fetch failed/i.test(err.message ?? "");
}

/**
 * Retry an async operation with exponential backoff + jitter.
 * Every external API call in ColdWave should be wrapped in this.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const {
    retries = 5,
    baseDelayMs = 500,
    maxDelayMs = 30_000,
    jitter = true,
    isRetryable = defaultIsRetryable,
    onRetry,
    label,
  } = opts;

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < retries && isRetryable(error);
      if (!canRetry) break;

      let delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));

      // Honor Retry-After when present on the error.
      const retryAfter = (error as { retryAfterMs?: number })?.retryAfterMs;
      if (typeof retryAfter === "number" && retryAfter > 0) {
        delay = Math.min(maxDelayMs, retryAfter);
      }

      if (jitter) delay = Math.round(delay * (0.5 + Math.random() * 0.5));

      onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }

  const prefix = label ? `[${label}] ` : "";
  if (lastError instanceof Error) {
    lastError.message = `${prefix}${lastError.message}`;
    throw lastError;
  }
  throw new Error(`${prefix}Operation failed after ${retries} attempts`);
}
