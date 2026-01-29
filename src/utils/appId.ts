/**
 * App ID Utility
 *
 * Generates and persists a unique client app ID for this browser session.
 * Used to track generation requests and progress events.
 */

import { v4 as uuidv4 } from 'uuid';

const APP_ID_KEY = 'sogni_360_client_app_id';

/**
 * Get or create a unique client app ID for this browser
 */
export function getClientAppId(): string {
  try {
    let appId = localStorage.getItem(APP_ID_KEY);

    if (!appId) {
      appId = `sogni-360-${uuidv4()}`;
      localStorage.setItem(APP_ID_KEY, appId);
      console.log('[AppId] Created new client app ID:', appId);
    }

    return appId;
  } catch (error) {
    // Fallback if localStorage is not available
    console.warn('[AppId] LocalStorage not available, using session-only ID');
    return `sogni-360-${uuidv4()}`;
  }
}

/**
 * Reset the client app ID (useful for debugging)
 */
export function resetClientAppId(): string {
  try {
    localStorage.removeItem(APP_ID_KEY);
  } catch {
    // Ignore
  }
  return getClientAppId();
}

// Alias for compatibility with Photobooth services
export const getOrCreateAppId = getClientAppId;

export default getClientAppId;
