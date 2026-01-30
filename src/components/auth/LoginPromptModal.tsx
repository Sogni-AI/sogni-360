import React from 'react';
import { createPortal } from 'react-dom';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
  title?: string;
  message?: string;
}

function LoginPromptModal({
  isOpen,
  onClose,
  onLogin,
  title = 'Login Required',
  message = 'Please log in or create an account to continue.'
}: Props) {
  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[10000] p-5"
      onClick={handleOverlayClick}
    >
      <div className="relative w-full max-w-md bg-gradient-to-br from-gray-900/98 to-gray-950/98 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 text-white text-2xl flex items-center justify-center hover:bg-white/20 transition-all z-10"
          onClick={onClose}
        >
          ×
        </button>

        <div className="p-8 pt-10">
          {/* Sloth Mascot */}
          <div className="text-center mb-6">
            <img
              src="/sloth_cam_hop_trnsparent.png"
              alt="Sogni 360"
              className="w-28 h-28 mx-auto object-contain mb-2"
              style={{ filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3))' }}
            />
            <h2 className="text-2xl font-bold text-white">{title}</h2>
          </div>

          {/* Message */}
          <p className="text-gray-300 text-center mb-8 leading-relaxed">
            {message}
          </p>

          {/* Benefits */}
          <div className="space-y-3 mb-8">
            <div className="flex items-center gap-3 text-gray-300">
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm">50 FREE credits daily with Daily Boost</span>
            </div>
            <div className="flex items-center gap-3 text-gray-300">
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm">Save and access your projects anywhere</span>
            </div>
            <div className="flex items-center gap-3 text-gray-300">
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm">Generate video transitions</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={onLogin}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-base hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-purple-500/25"
            >
              Log in or Sign up
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 px-6 rounded-xl bg-white/5 text-gray-400 font-medium text-sm hover:bg-white/10 transition-all border border-white/10"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default LoginPromptModal;
