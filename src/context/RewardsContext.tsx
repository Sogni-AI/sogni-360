/**
 * Rewards Context Provider
 * Manages daily boost claims and reward fetching with Turnstile protection
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Turnstile from 'react-turnstile';
import { Reward } from '../types/rewards';
import { useSogniAuth, sogniAuth } from '../services/sogniAuth';
import { getTurnstileKey } from '../config/env';
import { useToast } from './ToastContext';
import { playSogniSignatureIfEnabled } from '../utils/sonicLogos';

interface RewardsContextType {
  rewards: Reward[];
  claimableCount: number;
  error: string | null;
  loading: boolean;
  claimInProgress: boolean;
  lastClaimSuccess: boolean;
  refresh: () => void;
  claimReward: (id: string | string[], skipTurnstile?: boolean) => void;
  claimRewardWithToken: (id: string | string[], turnstileToken: string) => void;
  resetClaimState: () => void;
}

const RewardsContext = createContext<RewardsContextType>({
  rewards: [],
  claimableCount: 0,
  error: null,
  loading: false,
  claimInProgress: false,
  lastClaimSuccess: false,
  refresh: () => {},
  claimReward: () => {},
  claimRewardWithToken: () => {},
  resetClaimState: () => {}
});

function isTimeLocked(reward: Reward): boolean {
  return !!reward.nextClaim && reward.nextClaim.getTime() > Date.now();
}

function isClaimable(reward: Reward): boolean {
  return reward.canClaim && !isTimeLocked(reward);
}

interface RewardsProviderProps {
  children: React.ReactNode;
}

export const RewardsProvider: React.FC<RewardsProviderProps> = ({ children }) => {
  const { isAuthenticated } = useSogniAuth();
  const { showToast } = useToast();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [claimIntent, setClaimIntent] = useState<{ id?: string | string[]; token?: string }>({});
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimInProgress, setClaimInProgress] = useState(false);
  const [lastClaimSuccess, setLastClaimSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);

  // Guard to prevent duplicate fetches
  const isFetchingRef = useRef(false);
  const hasInitialFetchRef = useRef(false);

  // Rate limit backoff state
  const rateLimitBackoffRef = useRef(0);
  const rateLimitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch rewards from API with rate limit handling
  const fetchRewards = useCallback(async () => {
    if (!isAuthenticated) {
      setRewards([]);
      hasInitialFetchRef.current = false;
      return;
    }

    if (isFetchingRef.current) {
      return;
    }

    if (rateLimitBackoffRef.current > Date.now()) {
      return;
    }

    // Access sogniClient directly from singleton to avoid reference instability
    const client = sogniAuth.getSogniClient();
    if (!client) {
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const rewardsData = await client.account.rewards();

      const transformedRewards = rewardsData.map((reward: any) => ({
        ...reward,
        nextClaim: reward.nextClaim ? new Date(reward.nextClaim) : undefined
      }));

      setRewards(transformedRewards);
      hasInitialFetchRef.current = true;
      rateLimitBackoffRef.current = 0;
    } catch (err: any) {
      console.error('Failed to fetch rewards:', err);

      if (err.message?.includes('429') || err.statusCode === 429) {
        const backoffMinutes = rateLimitBackoffRef.current > 0 ? 5 : 2;
        rateLimitBackoffRef.current = Date.now() + (backoffMinutes * 60 * 1000);
        setError(`Rate limited. Please wait ${backoffMinutes} minutes before trying again.`);
      } else {
        setError(err.message || 'Failed to load rewards');
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && !hasInitialFetchRef.current) {
      fetchRewards();
    } else if (!isAuthenticated) {
      setRewards([]);
      hasInitialFetchRef.current = false;
    }

    return () => {
      if (rateLimitTimeoutRef.current) {
        clearTimeout(rateLimitTimeoutRef.current);
        rateLimitTimeoutRef.current = null;
      }
    };
    // fetchRewards is stable (only changes with isAuthenticated)
  }, [isAuthenticated]);

  const claimReward = useCallback((id: string | string[], skipTurnstile = false) => {
    setClaimIntent({ id, token: skipTurnstile === true ? 'skip' : undefined });
  }, []);

  const claimRewardWithToken = useCallback((id: string | string[], turnstileToken: string) => {
    setClaimInProgress(true);
    setLastClaimSuccess(false);
    setClaimIntent({ id, token: turnstileToken });
  }, []);

  const resetClaimState = useCallback(() => {
    setClaimInProgress(false);
    setLastClaimSuccess(false);
  }, []);

  const handleTurnstileToken = useCallback((token: string) => {
    setClaimIntent((prev) => ({ ...prev, token }));
  }, []);

  const handleCancelClaim = useCallback(() => {
    setClaimIntent({});
    setTurnstileError(null);
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileError('Verification failed. This may happen on local development.');
    showToast({
      title: 'Verification Error',
      message: 'Could not complete bot verification. This may happen on local development domains.',
      type: 'error'
    });
    // showToast is a stable context function
  }, []);

  useEffect(() => {
    if (claimIntent.id && claimIntent.token) {
      const ids = Array.isArray(claimIntent.id) ? claimIntent.id : [claimIntent.id];
      const token = claimIntent.token === 'skip' ? undefined : claimIntent.token;
      const claimedRewards = rewards?.filter((reward) => ids.includes(reward.id));

      if (!claimedRewards?.length) {
        setClaimIntent({});
        return;
      }

      // Access sogniClient directly from singleton to avoid reference instability
      const client = sogniAuth.getSogniClient();
      if (!client) {
        setClaimIntent({});
        return;
      }

      setClaimIntent({});
      setClaimLoading(true);

      client.account
        .claimRewards(ids, {
          turnstileToken: token,
          provider: claimedRewards[0].provider
        })
        .then(() => {
          setLastClaimSuccess(true);

          const rewardTitles = claimedRewards.map(r => r.title).join(', ');
          const totalAmount = claimedRewards.reduce((sum, r) => sum + parseFloat(r.amount), 0);
          showToast({
            title: 'Reward Claimed!',
            message: `Successfully claimed: ${rewardTitles} (${totalAmount} credits)`,
            type: 'success'
          });

          playSogniSignatureIfEnabled();
          return fetchRewards();
        })
        .catch((err: any) => {
          let errorTitle = 'Claim Failed';
          let errorMessage = err.message || 'Failed to claim reward';

          if (err.message?.includes('429') || err.statusCode === 429) {
            const backoffMinutes = 2;
            rateLimitBackoffRef.current = Date.now() + (backoffMinutes * 60 * 1000);
            errorTitle = 'Rate Limited';
            errorMessage = `Too many requests. Please wait ${backoffMinutes} minutes before trying again.`;
          } else if (errorMessage.includes('verify your email')) {
            errorTitle = 'Email Verification Required';
            errorMessage = 'Please verify your email to claim rewards. Check your inbox for the verification link.';
          }

          setError(errorMessage);

          showToast({
            title: errorTitle,
            message: errorMessage,
            type: 'error'
          });
        })
        .finally(() => {
          setClaimLoading(false);
          setClaimInProgress(false);
        });
    }
    // fetchRewards and showToast are stable functions
  }, [claimIntent, rewards]);

  const contextValue = useMemo<RewardsContextType>(
    () => ({
      rewards,
      claimableCount: rewards?.filter(isClaimable).length || 0,
      error,
      loading: loading || claimLoading,
      claimInProgress,
      lastClaimSuccess,
      refresh: fetchRewards,
      claimReward,
      claimRewardWithToken,
      resetClaimState
    }),
    [rewards, error, loading, claimLoading, claimInProgress, lastClaimSuccess, fetchRewards, claimReward, claimRewardWithToken, resetClaimState]
  );

  return (
    <RewardsContext.Provider value={contextValue}>
      {children}

      {/* Turnstile Modal for bot protection */}
      {!!claimIntent.id && !claimIntent.token && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center"
            onClick={handleCancelClaim}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800 rounded-xl shadow-2xl z-[9999] p-6 min-w-[300px]">
            <div className="text-lg font-semibold text-white mb-5 text-center">
              Verify you are human
            </div>
            <div className="flex flex-col justify-center items-center gap-4">
              {turnstileError ? (
                <>
                  <p className="text-sm text-gray-300 text-center">{turnstileError}</p>
                  <button
                    onClick={handleCancelClaim}
                    className="px-4 py-2 text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </>
              ) : (
                <Turnstile
                  sitekey={getTurnstileKey()}
                  onVerify={handleTurnstileToken}
                  onError={handleTurnstileError}
                />
              )}
            </div>
          </div>
        </>
      )}
    </RewardsContext.Provider>
  );
};

export const useRewards = (): RewardsContextType => {
  return useContext(RewardsContext);
};
