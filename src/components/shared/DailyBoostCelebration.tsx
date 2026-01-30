import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Turnstile from 'react-turnstile';
import { getTurnstileKey } from '../../config/env';
import ConfettiCelebration from './ConfettiCelebration';
import './DailyBoostCelebration.css';

type CelebrationState = 'idle' | 'claiming' | 'success';

interface DailyBoostCelebrationProps {
  isVisible: boolean;
  creditAmount: number;
  onClaim: (turnstileToken: string) => void;
  onDismiss: () => void;
  isClaiming: boolean;
  claimSuccess: boolean;
  claimError: string | null;
}

// SVG Icons for professional look
const SparkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="spark-icon">
    <path
      d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
      fill="url(#spark-gradient)"
    />
    <defs>
      <linearGradient id="spark-gradient" x1="2" y1="2" x2="22" y2="22">
        <stop stopColor="#14b8a6" />
        <stop offset="1" stopColor="#06b6d4" />
      </linearGradient>
    </defs>
  </svg>
);

const GiftIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg viewBox="0 0 64 64" fill="none" className={`gift-icon ${isOpen ? 'opened' : ''}`}>
    <defs>
      <linearGradient id="gift-gradient" x1="0" y1="0" x2="64" y2="64">
        <stop stopColor="#14b8a6" />
        <stop offset="1" stopColor="#0891b2" />
      </linearGradient>
      <linearGradient id="ribbon-gradient" x1="0" y1="0" x2="64" y2="64">
        <stop stopColor="#06b6d4" />
        <stop offset="1" stopColor="#22d3ee" />
      </linearGradient>
    </defs>
    {/* Box base */}
    <rect x="8" y="28" width="48" height="32" rx="4" fill="url(#gift-gradient)" />
    {/* Ribbon vertical */}
    <rect x="28" y="28" width="8" height="32" fill="url(#ribbon-gradient)" />
    {/* Box lid */}
    <rect x="4" y="20" width="56" height="12" rx="3" fill="url(#gift-gradient)" />
    {/* Ribbon horizontal */}
    <rect x="4" y="24" width="56" height="6" fill="url(#ribbon-gradient)" />
    {/* Bow */}
    <ellipse cx="32" cy="16" rx="8" ry="6" fill="url(#ribbon-gradient)" />
    <ellipse cx="24" cy="18" rx="6" ry="4" fill="url(#ribbon-gradient)" />
    <ellipse cx="40" cy="18" rx="6" ry="4" fill="url(#ribbon-gradient)" />
    <circle cx="32" cy="18" r="3" fill="#0e7490" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="check-icon">
    <circle cx="12" cy="12" r="10" fill="url(#check-gradient)" />
    <path d="M8 12L11 15L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <defs>
      <linearGradient id="check-gradient" x1="2" y1="2" x2="22" y2="22">
        <stop stopColor="#10b981" />
        <stop offset="1" stopColor="#059669" />
      </linearGradient>
    </defs>
  </svg>
);

const DailyBoostCelebration: React.FC<DailyBoostCelebrationProps> = ({
  isVisible,
  creditAmount,
  onClaim,
  onDismiss,
  isClaiming,
  claimSuccess,
  claimError
}) => {
  const [claimState, setClaimState] = useState<CelebrationState>('idle');
  const [showTurnstile, setShowTurnstile] = useState(false);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [displayedCredits, setDisplayedCredits] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const autoCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const counterIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasHandledSuccessRef = useRef(false);

  // Reset state when modal visibility changes
  useEffect(() => {
    if (isVisible) {
      setClaimState('idle');
      setShowTurnstile(false);
      setTurnstileError(null);
      setDisplayedCredits(0);
      setShowConfetti(false);
      setIsClosing(false);
      hasHandledSuccessRef.current = false;
    }
  }, [isVisible]);

  // Track claiming state from props
  useEffect(() => {
    if (isClaiming && claimState === 'idle') {
      setClaimState('claiming');
    }
  }, [isClaiming, claimState]);

  // Handle claim error - close modal after brief delay
  useEffect(() => {
    if (claimError && claimState === 'claiming') {
      const errorTimeout = setTimeout(() => {
        setIsClosing(true);
        setTimeout(() => {
          onDismiss();
        }, 300);
      }, 500);

      return () => clearTimeout(errorTimeout);
    }
  }, [claimError, claimState, onDismiss]);

  // Handle successful claim
  useEffect(() => {
    if (claimSuccess && !hasHandledSuccessRef.current && claimState !== 'success') {
      hasHandledSuccessRef.current = true;
      setClaimState('success');
      setShowConfetti(true);
      setDisplayedCredits(creditAmount);

      // Animate the credit counter
      const duration = 800;
      const steps = 16;
      const startValue = Math.max(0, creditAmount - 15);
      const increment = (creditAmount - startValue) / steps;
      let current = startValue;

      setDisplayedCredits(startValue);

      counterIntervalRef.current = setInterval(() => {
        current += increment;
        if (current >= creditAmount) {
          setDisplayedCredits(creditAmount);
          if (counterIntervalRef.current) {
            clearInterval(counterIntervalRef.current);
            counterIntervalRef.current = null;
          }
        } else {
          setDisplayedCredits(Math.round(current));
        }
      }, duration / steps);

      // Auto-close after 2.5 seconds
      autoCloseTimeoutRef.current = setTimeout(() => {
        setIsClosing(true);
        setTimeout(() => {
          onDismiss();
        }, 400);
      }, 2500);
    }
  }, [claimSuccess, creditAmount, onDismiss, claimState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimeoutRef.current) {
        clearTimeout(autoCloseTimeoutRef.current);
      }
      if (counterIntervalRef.current) {
        clearInterval(counterIntervalRef.current);
      }
    };
  }, []);

  const handleClaimClick = useCallback(() => {
    const turnstileKey = getTurnstileKey();
    // Skip turnstile in development when no key is configured
    if (!turnstileKey) {
      onClaim('');
      return;
    }
    setShowTurnstile(true);
  }, [onClaim]);

  const handleTurnstileVerify = useCallback((token: string) => {
    setShowTurnstile(false);
    setTurnstileError(null);
    onClaim(token);
  }, [onClaim]);

  const handleTurnstileError = useCallback(() => {
    setTurnstileError('Verification failed. This may happen on local development. Please try again later.');
  }, []);

  const handleCancelTurnstile = useCallback(() => {
    setShowTurnstile(false);
    setTurnstileError(null);
  }, []);

  const handleDismiss = useCallback(() => {
    if (autoCloseTimeoutRef.current) {
      clearTimeout(autoCloseTimeoutRef.current);
    }
    setIsClosing(true);
    setTimeout(() => {
      onDismiss();
    }, 300);
  }, [onDismiss]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && claimState === 'idle' && !showTurnstile) {
      handleDismiss();
    }
  }, [claimState, showTurnstile, handleDismiss]);

  if (!isVisible) return null;

  const modalContent = (
    <>
      <ConfettiCelebration isVisible={showConfetti} />

      <div
        className={`daily-boost-backdrop ${isClosing ? 'closing' : ''}`}
        onClick={handleBackdropClick}
      >
        <div className={`daily-boost-modal ${claimState} ${isClosing ? 'closing' : ''}`}>
          {/* Ambient glow effects */}
          <div className="ambient-glow glow-1" />
          <div className="ambient-glow glow-2" />

          {/* Free badge */}
          <div className="free-badge">
            <span>free</span>
          </div>

          {/* Header */}
          <div className="daily-boost-header">
            <SparkIcon />
            <h2 className="header-text">daily boost</h2>
            <SparkIcon />
          </div>

          {/* Subheader */}
          <p className="subheader">
            {claimState === 'success' ? 'credits added to your account' : 'claim your free credits'}
          </p>

          {/* Icon container */}
          <div className={`icon-container ${claimState}`}>
            {claimState === 'success' ? (
              <div className="success-icon-wrapper">
                <CheckIcon />
                <div className="success-rings">
                  <div className="ring ring-1" />
                  <div className="ring ring-2" />
                  <div className="ring ring-3" />
                </div>
              </div>
            ) : (
              <div className={`gift-wrapper ${claimState === 'claiming' ? 'pulsing' : ''}`}>
                <GiftIcon isOpen={false} />
                <div className="gift-glow" />
              </div>
            )}
          </div>

          {/* Credit amount display */}
          <div className="credit-display">
            <span className="plus-sign">+</span>
            <span className="credit-amount">
              {claimState === 'success' ? displayedCredits : creditAmount}
            </span>
            <span className="credit-label">credits</span>
          </div>

          {/* Claim button or turnstile */}
          {claimState === 'idle' && !showTurnstile && (
            <button className="claim-button" onClick={handleClaimClick}>
              claim now
            </button>
          )}

          {/* Turnstile verification */}
          {showTurnstile && claimState === 'idle' && (
            <div className="turnstile-container">
              <div className="turnstile-label">quick verification</div>
              {turnstileError ? (
                <div className="turnstile-error">
                  <p className="turnstile-error-message">{turnstileError}</p>
                  <button className="turnstile-retry-button" onClick={handleCancelTurnstile}>
                    Go Back
                  </button>
                </div>
              ) : (
                <Turnstile
                  sitekey={getTurnstileKey()}
                  onVerify={handleTurnstileVerify}
                  onError={handleTurnstileError}
                  theme="dark"
                />
              )}
            </div>
          )}

          {/* Claiming state */}
          {claimState === 'claiming' && (
            <div className="claiming-indicator">
              <div className="spinner" />
              <span>claiming your credits...</span>
            </div>
          )}

          {/* Success state */}
          {claimState === 'success' && (
            <div className="success-message">
              <span>added to your balance</span>
            </div>
          )}

          {/* Dismiss link */}
          {claimState === 'idle' && !showTurnstile && (
            <button className="dismiss-link" onClick={handleDismiss}>
              maybe later
            </button>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
};

export default React.memo(DailyBoostCelebration);
