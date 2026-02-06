import { useState, useEffect, useRef, forwardRef, useImperativeHandle, memo, useCallback } from 'react';
import { useSogniAuth } from '../../services/sogniAuth';
import { useWallet } from '../../hooks/useWallet';
import { formatTokenAmount, getTokenLabel } from '../../services/walletService';
import { useRewards } from '../../context/RewardsContext';
import LoginModal, { LoginModalMode } from './LoginModal';
import DailyBoostCelebration from '../shared/DailyBoostCelebration';
import AdvancedSettingsPopup from '../shared/AdvancedSettingsPopup';
import { getAuthButtonText, getDefaultModalMode, markAsVisited } from '../../utils/visitorTracking';
import '../../styles/components/AuthStatus.css';

// App version - update this when making changes to verify updates are being applied
const APP_VERSION = '1.1.2';

// Helper to format time remaining
const formatTimeRemaining = (ms: number): string => {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

interface AuthStatusProps {
  onPurchaseClick?: () => void;
  onSignupComplete?: () => void;
  textColor?: string;
}

export interface AuthStatusRef {
  openLoginModal: () => void;
}

export const AuthStatus = memo(forwardRef<AuthStatusRef, AuthStatusProps>(({
  onPurchaseClick,
  onSignupComplete,
  textColor = '#ffffff'
}, ref) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<LoginModalMode>('login');
  const [highlightDailyBoost, setHighlightDailyBoost] = useState(false);
  const [showDailyBoostCelebration, setShowDailyBoostCelebration] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [isNewSignup, setIsNewSignup] = useState(false); // Track if user just signed up (don't auto-show boost)
  const hasShownLoginBoostRef = useRef(false);
  const authButtonTextRef = useRef<string>(getAuthButtonText());
  const authButtonText = authButtonTextRef.current;
  const defaultModalModeRef = useRef<'login' | 'signup'>(getDefaultModalMode());
  const menuContainerRef = useRef<HTMLDivElement>(null);

  const { isAuthenticated, authMode, user, logout, isLoading } = useSogniAuth();
  const { balances, tokenType, switchPaymentMethod } = useWallet();
  const { rewards, claimRewardWithToken, claimInProgress, lastClaimSuccess, resetClaimState, error: claimError, loading: rewardsLoading } = useRewards();

  // Mark visitor on mount
  useEffect(() => {
    markAsVisited();
  }, [authButtonText]);

  // Get daily boost reward (ID "2" is the daily boost)
  const dailyBoostReward = rewards.find(r => r.id === '2');
  const canClaimDailyBoost = dailyBoostReward?.canClaim &&
    (!dailyBoostReward?.nextClaim || dailyBoostReward.nextClaim.getTime() <= Date.now());
  const hasClaimedToday = dailyBoostReward?.nextClaim && dailyBoostReward.nextClaim.getTime() > Date.now();

  // Auto-show daily boost celebration on login (but NOT for fresh signups)
  // Fresh signups need to verify email first, so we wait for onSignupComplete
  useEffect(() => {
    if (hasShownLoginBoostRef.current) return;
    if (isNewSignup) return; // Don't auto-show for new signups
    if (!isAuthenticated || rewardsLoading || rewards.length === 0) return;
    if (!canClaimDailyBoost) return;

    hasShownLoginBoostRef.current = true;
    setTimeout(() => {
      setShowDailyBoostCelebration(true);
    }, 800);
  }, [isAuthenticated, canClaimDailyBoost, rewardsLoading, rewards.length, isNewSignup]);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showUserMenu && menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  const handleLoginClick = () => {
    const mode = defaultModalModeRef.current;
    // Track if user is starting a signup flow
    if (mode === 'signup') {
      setIsNewSignup(true);
    }
    setLoginModalMode(mode);
    setShowLoginModal(true);
  };

  useImperativeHandle(ref, () => ({
    openLoginModal: handleLoginClick
  }));

  const handleCloseLoginModal = () => {
    setShowLoginModal(false);
    // If closing without completing signup, clear the new signup flag
    setIsNewSignup(false);
  };

  const handleModeChange = (mode: LoginModalMode) => {
    // Track if user switches to signup mode
    if (mode === 'signup') {
      setIsNewSignup(true);
    }
    setLoginModalMode(mode);
  };

  const handleSignupComplete = () => {
    setShowLoginModal(false);

    // User clicked "I verified my email!" - clear the new signup flag
    // This will trigger the useEffect to show daily boost once rewards are loaded
    setIsNewSignup(false);

    if (onSignupComplete) {
      onSignupComplete();
    }
  };

  const handleBuyPremiumSpark = () => {
    if (onPurchaseClick) {
      onPurchaseClick();
      return;
    }

    // Fallback: redirect to external wallet
    const hostname = window.location.hostname;
    const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
    const isStaging = hostname.includes('staging');

    let appUrl: string;
    if (isLocalDev) {
      appUrl = 'https://app-local.sogni.ai';
    } else if (isStaging) {
      appUrl = 'https://app-staging.sogni.ai';
    } else {
      appUrl = 'https://app.sogni.ai';
    }

    window.open(`${appUrl}/wallet`, '_blank');
  };

  // Handle claim from celebration modal
  const handleCelebrationClaim = useCallback((turnstileToken: string) => {
    if (dailyBoostReward && canClaimDailyBoost) {
      claimRewardWithToken(dailyBoostReward.id, turnstileToken);
    }
  }, [dailyBoostReward, canClaimDailyBoost, claimRewardWithToken]);

  // Handle dismissal of celebration modal
  const handleCelebrationDismiss = useCallback(() => {
    setShowDailyBoostCelebration(false);
    resetClaimState();

    if (canClaimDailyBoost) {
      setShowUserMenu(true);
      setHighlightDailyBoost(true);
      setTimeout(() => {
        setHighlightDailyBoost(false);
      }, 10000);
    }
  }, [canClaimDailyBoost, resetClaimState]);

  // Handle claim from wallet button
  const handleClaimDailyBoost = useCallback(() => {
    if (dailyBoostReward && canClaimDailyBoost) {
      setShowDailyBoostCelebration(true);
    }
  }, [dailyBoostReward, canClaimDailyBoost]);

  // Clear highlight when daily boost is no longer claimable
  useEffect(() => {
    if (!canClaimDailyBoost && highlightDailyBoost) {
      setHighlightDailyBoost(false);
    }
  }, [canClaimDailyBoost, highlightDailyBoost]);

  const currentBalance = balances?.[tokenType]?.net || '0';
  const tokenLabel = getTokenLabel(tokenType);

  return (
    <>
      {!isAuthenticated ? (
        <button
          onClick={handleLoginClick}
          disabled={isLoading}
          style={{
            background: 'transparent',
            color: textColor,
            border: 'none',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: '700',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            textDecoration: 'underline',
            opacity: isLoading ? 0.5 : 1,
            transition: 'opacity 0.2s ease'
          }}
          onMouseEnter={(e) => !isLoading && (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={(e) => !isLoading && (e.currentTarget.style.opacity = '1')}
        >
          {isLoading ? 'Loading...' : authButtonText}
        </button>
      ) : (
        <div className="relative auth-status-container" ref={menuContainerRef}>
          <div
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="auth-status-content"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: textColor,
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              userSelect: 'none',
              flexWrap: 'wrap'
            }}
          >
            <span style={{ color: textColor, fontWeight: '700' }}>
              @{authMode === 'demo' ? 'Demo Mode' : user?.username || 'User'}
            </span>

            {authMode !== 'demo' && balances && (
              <>
                <span className="auth-separator" style={{ color: textColor, opacity: 0.7 }}>|</span>
                <span className="auth-balance" style={{ color: textColor, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {formatTokenAmount(currentBalance)} {tokenLabel}
                </span>
              </>
            )}
          </div>

          {showUserMenu && (
            <div
              className="auth-wallet-container"
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: '0',
                zIndex: 1001,
                padding: '16px',
                minWidth: '260px'
              }}
            >
              <div className="auth-wallet-content">
                {/* Payment Method Toggle */}
                {authMode !== 'demo' && balances && (
                  <>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'lowercase' }}>
                      paying with
                    </div>
                    <div className="auth-token-toggle">
                      <button
                        className={`auth-token-button sogni ${tokenType === 'sogni' ? 'active' : ''}`}
                        onClick={() => switchPaymentMethod('sogni')}
                        style={{ position: 'relative', overflow: 'visible' }}
                      >
                        <div
                          className={tokenType === 'sogni' ? 'sogni-logo-container active' : 'sogni-logo-container'}
                          style={{
                            position: 'absolute',
                            left: '4px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '36px',
                            height: '36px',
                            zIndex: 2
                          }}
                        >
                          {tokenType === 'sogni' && (
                            <>
                              <div className="sogni-particle sogni-particle-1" />
                              <div className="sogni-particle sogni-particle-2" />
                              <div className="sogni-particle sogni-particle-3" />
                              <div className="sogni-particle sogni-particle-4" />
                              <div className="sogni-particle sogni-particle-5" />
                              <div className="sogni-particle sogni-particle-6" />
                              <div className="sogni-particle sogni-particle-7" />
                              <div className="sogni-particle sogni-particle-8" />
                            </>
                          )}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 120 110"
                            style={{
                              width: '36px',
                              height: '36px',
                              fill: 'currentColor',
                              display: 'block',
                              position: 'relative',
                              zIndex: 3,
                              transform: tokenType === 'sogni' ? 'scale(1.15)' : 'scale(1)',
                              filter: tokenType === 'sogni'
                                ? 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))'
                                : 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))',
                              transition: 'all 0.3s ease',
                              opacity: tokenType === 'sogni' ? 1 : 0.5
                            }}
                          >
                            <defs>
                              <clipPath id="sogni-circle-clip">
                                <circle cx="51" cy="51" r="50" />
                              </clipPath>
                            </defs>
                            <g clipPath="url(#sogni-circle-clip)">
                              <path d="M1 1h100v100H1z" style={{ opacity: 0.08 }} />
                              <path d="M44.6 94.8h-1.9l-1.9 6.3h1.9l1.9-6.3zM92 94.8H47.2l-1.9 6.3H90l2-6.3zM58 88.5h-1.9l-1.8 6.3h1.9l1.8-6.3zM100.1 88.5H60l-1.8 6.3h40.1l1.8-6.3zM50.8 82.3h-1.7l-1.8 6.3H49l1.8-6.3z" />
                              <path d="M100 82.3H52.8l-1.7 6.3h47.2l1.7-6.3z" />
                              <path d="M68 82.3h-2l-2.1 6.3h2l2.1-6.3zM44.2 76h-1.7l-1.8 6.3h1.7l1.8-6.3zM94.4 76h-5.2L86 82.3h5.2l3.2-6.3z" />
                              <path d="M86.8 76H46.6l-1.8 6.3h39l3-6.3z" />
                              <path d="M72.7 69.8h46.2l-2 6.3H71.4l1.3-6.3zM69 69.8h1.7L69.3 76h-1.7l1.4-6.2zM111 63.5H63.3l-1.5 6.3h47.4l1.8-6.3zM61.3 63.5h-1.7l-1.5 6.3h1.7l1.5-6.3zM58 63.5h42l1-6.3H59.6L58 63.5zM54.3 63.5H56l1.5-6.3h-1.7l-1.5 6.3z" />
                              <path d="M74.4 51h31.2l-1 6.3H74.1l.3-6.3zM70.7 51h1.7l-.4 6.3h-1.7l.4-6.3zM60 44.7h25.9l.7 6.3H61.5L60 44.7zM88 44.7h41.4l1.8 6.3H88.8l-.8-6.3zM56.3 44.7H58l1.5 6.3h-1.7l-1.5-6.3z" />
                              <path d="M56.6 38.5h43.2l1.2 6.3H58l-1.4-6.3zM52.8 38.5h1.7l1.5 6.3h-1.7l-1.5-6.3zM72.8 32.2h31.8v6.3H73.3l-.5-6.3zM69 32.2h1.7l.5 6.3h-1.7l-.5-6.3z" />
                              <path d="M44.6 26h43.2l3.3 6.3h-45L44.6 26zM90.2 26h43.1l1.8 6.3H93.6L90.2 26zM40.9 26h1.7l1.5 6.3h-1.7L40.9 26zM69.7 19.7h43.6L115 26H71.5l-1.8-6.3zM66.1 19.7h1.7l1.7 6.3h-1.7l-1.7-6.3z" />
                              <path d="M51 13.5h39.2l1.7 6.3H52.3L51 13.5zM93 13.5h39.2l1.6 6.3h-39L93 13.5zM47.3 13.5H49l1.5 6.3h-1.7l-1.5-6.3zM64.3 7.2h45.4l1.8 6.3H68.2l-3.9-6.3z" />
                              <path d="M60.1 7.2h2l3.8 6.3h-2l-3.8-6.3zM91.3 1h39.1l1.8 6.3H93L91.3 1z" />
                              <path d="M44.6 1h43.2l1.8 6.3H46.1L44.6 1zM40.9 1h1.7L44 7.2h-1.7L40.9 1z" />
                            </g>
                          </svg>
                        </div>
                        <span style={{ marginLeft: '28px' }}>sogni token</span>
                      </button>
                      <button
                        className={`auth-token-button spark ${tokenType === 'spark' ? 'active' : ''}`}
                        onClick={() => switchPaymentMethod('spark')}
                        style={{ position: 'relative', overflow: 'visible' }}
                      >
                        <div
                          className={tokenType === 'spark' ? 'spark-logo-container active' : 'spark-logo-container'}
                          style={{
                            position: 'absolute',
                            left: '4px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '36px',
                            height: '36px',
                            zIndex: 2
                          }}
                        >
                          {tokenType === 'spark' && (
                            <>
                              <div className="sparkler-particle sparkler-particle-1" />
                              <div className="sparkler-particle sparkler-particle-2" />
                              <div className="sparkler-particle sparkler-particle-3" />
                              <div className="sparkler-particle sparkler-particle-4" />
                              <div className="sparkler-particle sparkler-particle-5" />
                              <div className="sparkler-particle sparkler-particle-6" />
                              <div className="sparkler-particle sparkler-particle-7" />
                              <div className="sparkler-particle sparkler-particle-8" />
                              <div className="sparkler-particle sparkler-particle-9" />
                              <div className="sparkler-particle sparkler-particle-10" />
                              <div className="sparkler-particle sparkler-particle-11" />
                              <div className="sparkler-particle sparkler-particle-12" />
                            </>
                          )}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 17 16"
                            style={{
                              width: '36px',
                              height: '36px',
                              fill: 'currentColor',
                              display: 'block',
                              position: 'relative',
                              zIndex: 3,
                              transform: tokenType === 'spark'
                                ? 'scale(1.15) rotate(5deg)'
                                : 'scale(1) rotate(0deg)',
                              filter: tokenType === 'spark'
                                ? 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))'
                                : 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))',
                              transition: 'all 0.3s ease',
                              opacity: tokenType === 'spark' ? 1 : 0.5
                            }}
                          >
                            <path d="M9.92301 1.1764C10.6242 0.251095 12.0169 0.251096 12.0445 1.1764L12.1576 4.97111C12.1663 5.26202 12.3269 5.49138 12.5973 5.59903L16.1244 7.0032C16.9845 7.34559 16.5082 8.65433 15.3989 8.99672L10.8495 10.4009C10.5008 10.5085 10.1732 10.7379 9.95276 11.0288L7.07732 14.8235C6.37616 15.7488 4.98344 15.7488 4.95585 14.8235L4.84273 11.0288C4.83406 10.7379 4.67346 10.5085 4.40305 10.4009L0.875887 8.99672C0.015819 8.65433 0.492163 7.34559 1.60147 7.0032L6.15079 5.59903C6.49955 5.49138 6.82712 5.26202 7.04756 4.97111L9.92301 1.1764Z" />
                          </svg>
                        </div>
                        <span style={{ marginLeft: '28px' }}>spark points</span>
                      </button>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Daily Boost Button */}
                      {dailyBoostReward && (
                        <div>
                          <button
                            className={`auth-daily-boost-button ${canClaimDailyBoost ? 'available' : 'claimed'}`}
                            onClick={handleClaimDailyBoost}
                            disabled={!canClaimDailyBoost || rewardsLoading}
                            style={{
                              animation: highlightDailyBoost ? 'dailyBoostGlow 2s ease-in-out infinite' : 'none'
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 12 20 22 4 22 4 12"></polyline>
                              <rect x="2" y="7" width="20" height="5"></rect>
                              <line x1="12" y1="22" x2="12" y2="7"></line>
                              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
                              <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
                            </svg>
                            {hasClaimedToday ? 'claimed' : rewardsLoading ? 'loading...' : 'daily boost'}
                          </button>
                          {hasClaimedToday && dailyBoostReward.nextClaim && (
                            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                              Available in {formatTimeRemaining(dailyBoostReward.nextClaim.getTime() - Date.now())}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Buy Spark Button */}
                      {tokenType === 'spark' && (
                        <button
                          className="auth-buy-spark-button"
                          onClick={handleBuyPremiumSpark}
                        >
                          buy spark
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* Advanced Settings Link */}
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'center' }}>
                  <button
                    className="auth-advanced-settings-link"
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowAdvancedSettings(true);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                    </svg>
                    advanced settings
                  </button>
                </div>

                {/* Logout Button */}
                <div style={{ paddingTop: '12px', textAlign: 'center' }}>
                  <button
                    className="auth-logout-button"
                    onClick={() => { void handleLogout(); }}
                    disabled={isLoading}
                  >
                    {isLoading ? 'logging out...' : 'logout'}
                  </button>
                </div>

                {/* Version Number */}
                <div style={{
                  marginTop: '12px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  textAlign: 'center',
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.3)',
                  fontFamily: 'monospace'
                }}>
                  v{APP_VERSION}
                </div>
              </div>
            </div>
          )}

          {/* Click outside to close */}
          {showUserMenu && (
            <div
              style={{ position: 'fixed', inset: '0', zIndex: 1000 }}
              onClick={() => setShowUserMenu(false)}
            />
          )}
        </div>
      )}

      {/* Login Modal */}
      <LoginModal
        open={showLoginModal}
        mode={loginModalMode}
        onModeChange={handleModeChange}
        onClose={handleCloseLoginModal}
        onSignupComplete={handleSignupComplete}
      />

      {/* Daily Boost Celebration Modal */}
      <DailyBoostCelebration
        isVisible={showDailyBoostCelebration}
        creditAmount={dailyBoostReward ? parseFloat(dailyBoostReward.amount) : 50}
        onClaim={handleCelebrationClaim}
        onDismiss={handleCelebrationDismiss}
        isClaiming={claimInProgress}
        claimSuccess={lastClaimSuccess}
        claimError={claimError}
      />

      {/* Advanced Settings Popup */}
      <AdvancedSettingsPopup
        isOpen={showAdvancedSettings}
        onClose={() => setShowAdvancedSettings(false)}
      />
    </>
  );
}));

export default AuthStatus;
