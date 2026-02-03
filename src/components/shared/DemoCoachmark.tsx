/**
 * Demo Coachmark
 *
 * Shows a helpful overlay when users load a demo project for the first time.
 * Explains that they've loaded a completed project and can click through
 * the Progress Steps to see how the video was made.
 */

import React, { useEffect, useRef } from 'react';
import { markDemoCoachmarkAsShown } from '../../constants/demo-projects';
import './DemoCoachmark.css';

interface DemoCoachmarkProps {
  isOpen: boolean;
  onClose: () => void;
  demoName?: string;
}

const DemoCoachmark: React.FC<DemoCoachmarkProps> = ({
  isOpen,
  onClose,
  demoName = 'Demo Project'
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Handle overlay click to close
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  // Prevent modal content clicks from bubbling
  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Handle close and mark as shown
  const handleClose = () => {
    markDemoCoachmarkAsShown();
    onClose();
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

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

  if (!isOpen) return null;

  return (
    <div className="demo-coachmark-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="demo-coachmark-modal" ref={modalRef} onClick={handleModalClick}>
        <button className="demo-coachmark-close" onClick={handleClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="demo-coachmark-content">
          {/* Mascot */}
          <div className="demo-coachmark-mascot">
            <img
              src="/sloth_cam_hop_trnsparent.png"
              alt="Sogni Sloth"
            />
          </div>

          {/* Title */}
          <h2 className="demo-coachmark-title">
            Welcome to {demoName}!
          </h2>

          {/* Message */}
          <p className="demo-coachmark-message">
            You&apos;ve loaded a completed project. Click through the <strong>Progress Steps</strong> at the top to see how this 360° video was made.
          </p>

          {/* Visual indicator pointing to workflow wizard */}
          <div className="demo-coachmark-steps-preview">
            <div className="steps-preview-item completed">
              <div className="step-dot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Upload</span>
            </div>
            <div className="steps-preview-connector" />
            <div className="steps-preview-item completed">
              <div className="step-dot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Angles</span>
            </div>
            <div className="steps-preview-connector" />
            <div className="steps-preview-item completed">
              <div className="step-dot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Videos</span>
            </div>
            <div className="steps-preview-connector" />
            <div className="steps-preview-item active">
              <div className="step-dot">
                <span>5</span>
              </div>
              <span>Export</span>
            </div>
          </div>

          {/* Tips */}
          <div className="demo-coachmark-tips">
            <div className="tip-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <span>Click any step to explore that stage</span>
            </div>
            <div className="tip-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download the final video from Export</span>
            </div>
          </div>
        </div>

        {/* Action button */}
        <button className="demo-coachmark-action" onClick={handleClose}>
          Got it, let me explore!
        </button>
      </div>
    </div>
  );
};

export default DemoCoachmark;
