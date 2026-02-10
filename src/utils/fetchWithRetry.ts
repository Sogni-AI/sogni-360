/**
 * Fetch with Retry Utility
 *
 * Provides automatic retry logic for fetch requests with exponential backoff.
 * After the first direct failure, falls back to the backend proxy to bypass
 * browser CORS cache poisoning from <video> elements.
 *
 * Adapted from sogni-photobooth to match its proven behavior.
 */

import { getProxiedUrl } from './s3FetchWithFallback';

// Domains where the backend proxy can help bypass CORS cache poisoning
const PROXYABLE_DOMAINS = [
  's3-accelerate.amazonaws.com',
  's3.amazonaws.com',
  'cdn.sogni.ai',
];

function isProxyableUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return PROXYABLE_DOMAINS.some(d => hostname.includes(d));
  } catch {
    return false;
  }
}

/**
 * Options for fetchWithRetry
 */
export interface FetchWithRetryOptions {
  /** Maximum number of retry attempts (default: 2, meaning 3 total attempts) */
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
 * Fetch with automatic retry for transient CORS/network errors.
 * S3 presigned URLs can occasionally fail with CORS errors even when valid.
 * After the first direct retry fails, falls back to the backend proxy
 * to bypass browser CORS cache poisoning from <video> elements.
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
    maxRetries = 2,
    initialDelay = 2000,
    backoffMultiplier = 2,
    context = 'fetch'
  } = retryOptions;

  let lastError: Error | null = null;
  let currentDelay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // After first direct failure, try the backend proxy for S3/CDN URLs
      const fetchUrl = (attempt > 0 && isProxyableUrl(url))
        ? getProxiedUrl(url)
        : url;

      const response = await fetch(fetchUrl, options);
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
        `retrying via ${isProxyableUrl(url) ? 'proxy' : 'direct'} in ${currentDelay}ms...`
      );

      await delay(currentDelay);
      currentDelay = Math.round(currentDelay * backoffMultiplier);
    }
  }

  // Should not reach here, but TypeScript needs this
  throw lastError || new Error('Fetch failed with unknown error');
}
