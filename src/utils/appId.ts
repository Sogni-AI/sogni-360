/**
 * App ID Utility
 *
 * Generates and persists a unique client app ID for this browser session.
 * Used to track generation requests and progress events.
 */

import { v4 as uuidv4 } from 'uuid';

const APP_ID_KEY = 'sogni_360_client_app_id';

/**
 * Validate if a string is a valid UUID v4
 */
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Get or create a unique client app ID for this browser
 * Note: Must be a valid UUID format (no prefix) as required by Sogni API
 */
export function getClientAppId(): string {
  try {
    let appId = localStorage.getItem(APP_ID_KEY);

    // Check if existing appId is valid UUID (may have old prefixed format)
    if (!appId || !isValidUUID(appId)) {
      // Generate fresh UUID without prefix
      appId = uuidv4();
      localStorage.setItem(APP_ID_KEY, appId);
      console.log('[AppId] Created new client app ID:', appId);
    }

    return appId;
  } catch (error) {
    // Fallback if localStorage is not available
    console.warn('[AppId] LocalStorage not available, using session-only ID');
    return uuidv4();
  }
}

/**
 * Reset the client app ID (useful for debugging)
 * Generates a new valid UUID
 */
export function resetClientAppId(): string {
  try {
    const newAppId = uuidv4();
    localStorage.setItem(APP_ID_KEY, newAppId);
    console.log('[AppId] Reset client app ID:', newAppId);
    return newAppId;
  } catch {
    // Fallback if localStorage is not available
    return uuidv4();
  }
}

// Alias for compatibility with Photobooth services
export const getOrCreateAppId = getClientAppId;

export default getClientAppId;
