import React, { useRef, useEffect } from 'react';
import { TokenType } from '../../types/wallet';
import { getTokenLabel } from '../../services/walletService';
import './SwitchCurrencyPopup.css';

interface SwitchCurrencyPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitch: () => void;
  currentCurrency: TokenType;
  alternativeCurrency: TokenType;
  alternativeBalance: string;
}

const SwitchCurrencyPopup: React.FC<SwitchCurrencyPopupProps> = ({
  isOpen,
  onClose,
  onSwitch,
  currentCurrency,
  alternativeCurrency,
  alternativeBalance
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Handle overlay click to close
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Prevent modal content clicks from bubbling
  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Fix viewport height for mobile browsers
  useEffect(() => {
    if (isOpen && overlayRef.current) {
      const updateViewportHeight = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      };

      updateViewportHeight();
      window.addEventListener('resize', updateViewportHeight);
      window.addEventListener('orientationchange', updateViewportHeight);

      return () => {
        window.removeEventListener('resize', updateViewportHeight);
        window.removeEventListener('orientationchange', updateViewportHeight);
      };
    }
  }, [isOpen]);

  const handleSwitchClick = () => {
    onSwitch();
    onClose();
  };

  if (!isOpen) return null;

  const currentLabel = getTokenLabel(currentCurrency);
  const alternativeLabel = getTokenLabel(alternativeCurrency);

  return (
    <div className="switch-currency-modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="switch-currency-modal" ref={modalRef} onClick={handleModalClick}>
        <button className="switch-currency-modal-close" onClick={onClose}>×</button>

        <div className="switch-currency-modal-header">
          <div className="switch-currency-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9"></polyline>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
              <polyline points="7 23 3 19 7 15"></polyline>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>
          </div>
          <h2>Switch Payment Method?</h2>
        </div>

        <div className="switch-currency-modal-content">
          <p className="message-main">
            You're low on <strong>{currentLabel}</strong>, but you have <strong>{alternativeBalance} {alternativeLabel}</strong> available.
          </p>
          <p className="message-sub">
            Would you like to switch to {alternativeLabel} for this generation?
          </p>
        </div>

        <div className="switch-currency-modal-footer">
          <button
            className="switch-currency-btn primary"
            onClick={handleSwitchClick}
          >
            <span>Switch to {alternativeLabel}</span>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
          <button
            className="switch-currency-btn secondary"
            onClick={onClose}
          >
            Keep {currentLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SwitchCurrencyPopup;
