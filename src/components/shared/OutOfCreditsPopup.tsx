import React, { useRef, useEffect } from 'react';
import './OutOfCreditsPopup.css';

interface OutOfCreditsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchase?: () => void;
}

const OutOfCreditsPopup: React.FC<OutOfCreditsPopupProps> = ({ isOpen, onClose, onPurchase }) => {
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

  const handleGetCreditsClick = () => {
    if (onPurchase) {
      onPurchase();
      onClose();
    } else {
      window.open('https://app.sogni.ai/wallet', '_blank');
      onClose();
    }
  };

  const handleInfoItemClick = () => {
    if (onPurchase) {
      onPurchase();
      onClose();
    } else {
      window.open('https://app.sogni.ai/wallet', '_blank');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="out-of-credits-modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="out-of-credits-modal" ref={modalRef} onClick={handleModalClick}>
        <button className="out-of-credits-modal-close" onClick={onClose}>×</button>

        <div className="out-of-credits-modal-header">
          <div className="out-of-credits-mascot">
            <img
              src="/sloth_cam_hop_trnsparent.png"
              alt="Sogni Sloth"
              className="sloth-mascot"
            />
          </div>
          <h2>Oops! Out of credits</h2>
        </div>

        <div className="out-of-credits-modal-content">
          <div className="out-of-credits-message">
            <p className="message-main">
              You can get back to creating in no time!
            </p>
            <div className="credits-info">
              <div className="info-item" onClick={handleInfoItemClick}>
                <span className="info-icon">🎁</span>
                <span className="info-text">Check for <strong>free daily credits</strong></span>
              </div>
              <div className="info-item" onClick={handleInfoItemClick}>
                <span className="info-icon">💳</span>
                <span className="info-text">Buy more render credits</span>
              </div>
            </div>
          </div>
        </div>

        <div className="out-of-credits-modal-footer">
          <button
            className="out-of-credits-get-credits-btn"
            onClick={handleGetCreditsClick}
          >
            <span className="get-credits-text">Get more credits</span>
            <span className="get-credits-arrow">→</span>
          </button>
          <button
            className="out-of-credits-close-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default OutOfCreditsPopup;
