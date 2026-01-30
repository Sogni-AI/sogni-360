/**
 * Fetch with Retry Utility
 *
 * Provides automatic retry logic for fetch requests with exponential backoff.
 * Particularly useful for S3 presigned URLs that can occasionally fail with
 * transient CORS errors.
 */

/**
 * Options for fetchWithRetry
 */
export interface FetchWithRetryOptions {
  /** Maximum number of retry attempts (default: 3, meaning 4 total attempts) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 2000ms) */
  initialDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Optional context string for logging */
  context?: string;
}

/**
 * Delay helper
 */
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if an error is likely a transient network/CORS error that can be retried
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network errors that are typically transient
  const retryablePatterns = [
    'failed to fetch',
    'network',
    'cors',
    'net::err_failed',
    'load failed',
    'networkerror',
    'typeerror: failed to fetch',
    'the operation was aborted',
    'timeout'
  ];

  return retryablePatterns.some(pattern => message.includes(pattern));
}

/**
 * Fetch with automatic retry for transient CORS/network errors
 * S3 presigned URLs can occasionally fail with CORS errors even when valid.
 * Retrying after a short delay typically resolves these transient issues.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (same as native fetch)
 * @param retryOptions - Retry configuration
 * @returns Promise<Response> - The fetch response
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retryOptions: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelay = 2000,
    backoffMultiplier = 2,
    context = 'fetch'
  } = retryOptions;

  let lastError: Error | null = null;
  let currentDelay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      // If we got a response (even non-2xx), return it - let caller handle HTTP errors
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is a retryable error (network/CORS issues)
      const isRetryable = isRetryableError(lastError);

      if (!isRetryable || attempt >= maxRetries) {
        // Not retryable or exhausted retries
        if (attempt > 0) {
          console.warn(
            `[${context}] Failed after ${attempt + 1} attempts: ${lastError.message}`
          );
        }
        throw lastError;
      }

      // Log retry attempt
      console.log(
        `[${context}] Attempt ${attempt + 1} failed (${lastError.message}), ` +
        `retrying in ${currentDelay}ms...`
      );

      await delay(currentDelay);
      currentDelay = Math.round(currentDelay * backoffMultiplier);
    }
  }

  // Should not reach here, but TypeScript needs this
  throw lastError || new Error('Fetch failed with unknown error');
}
