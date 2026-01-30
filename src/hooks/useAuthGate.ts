/**
 * Hook for controlling when authentication is required for different features.
 *
 * Auth gating rules:
 * - First angles generation: FREE (demo mode allowed)
 * - Second+ angles generation: REQUIRES LOGIN
 * - Video generation: ALWAYS REQUIRES LOGIN
 */
import { useSogniAuth } from '../services/sogniAuth';
import { useApp } from '../context/AppContext';

interface AuthGateResult {
  /** Whether the user can generate angles (first generation is free) */
  canGenerateAngles: boolean;
  /** Whether the user can generate videos (always requires frontend SDK) */
  canGenerateVideos: boolean;
  /** Whether login is required for the next angles generation */
  requiresLoginForAngles: boolean;
  /** Whether login is required for video generation */
  requiresLoginForVideos: boolean;
  /** Whether the user is in frontend SDK mode (can use all features) */
  isFrontendMode: boolean;
}

export function useAuthGate(): AuthGateResult {
  const { isAuthenticated, authMode } = useSogniAuth();
  const { state } = useApp();

  // Check if user has already generated angles (used their free tier)
  const hasUsedFreeTier = state.currentProject?.waypoints.some(
    wp => wp.status === 'ready' && !wp.isOriginal
  ) ?? false;

  // Frontend SDK mode is required for full functionality
  const isFrontendMode = isAuthenticated && authMode === 'frontend';

  return {
    // Can generate angles if either haven't used free tier OR authenticated
    canGenerateAngles: !hasUsedFreeTier || isAuthenticated,
    // Can generate videos only in frontend SDK mode
    canGenerateVideos: isFrontendMode,
    // Requires login if already used free tier and not authenticated
    requiresLoginForAngles: hasUsedFreeTier && !isAuthenticated,
    // Videos always require frontend SDK mode
    requiresLoginForVideos: !isFrontendMode,
    isFrontendMode
  };
}

export default useAuthGate;
