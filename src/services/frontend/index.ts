/**
 * Frontend SDK Service
 *
 * Provides a unified interface for using the Sogni SDK in frontend mode.
 * When authenticated, operations use the SDK directly for faster processing
 * and proper credit deduction from the user's wallet.
 */

import type { SogniClient } from '@sogni-ai/sogni-client';
import { sogniAuth } from '../sogniAuth';

export interface FrontendSDKConfig {
  client: SogniClient;
  tokenType: 'spark' | 'sogni';
}

/**
 * Gets the current SDK configuration if user is authenticated in frontend mode
 */
export function getFrontendSDKConfig(): FrontendSDKConfig | null {
  const authState = sogniAuth.getAuthState();

  if (!authState.isAuthenticated || authState.authMode !== 'frontend') {
    return null;
  }

  const client = sogniAuth.getSogniClient();
  if (!client) {
    return null;
  }

  return {
    client,
    tokenType: 'spark' // Default to spark, can be configured
  };
}

/**
 * Checks if the user is in frontend SDK mode (authenticated with SDK access)
 */
export function isFrontendMode(): boolean {
  const config = getFrontendSDKConfig();
  return config !== null;
}

/**
 * Gets the Sogni client if available
 */
export function getSogniClient(): SogniClient | null {
  return sogniAuth.getSogniClient();
}

export type { SogniClient };
