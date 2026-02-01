import React, { useState, useEffect, useCallback } from 'react';

const DEFAULT_TRANSITION_PROMPT = `Smooth camera orbit around the subject. Preserve the same subject identity, facial structure, and environment. Seamless motion between camera angles with consistent lighting.`;

interface TransitionRegenerateModalProps {
  fromLabel: string;
  toLabel: string;
  fromImageUrl?: string;
  toImageUrl?: string;
  thumbAspect: number;
  currentPrompt?: string;
  onConfirm: (customPrompt: string) => void;
  onCancel: () => void;
}

const TransitionRegenerateModal: React.FC<TransitionRegenerateModalProps> = ({
  fromLabel,
  toLabel,
  fromImageUrl,
  toImageUrl,
  thumbAspect,
  currentPrompt,
  onConfirm,
  onCancel
}) => {
  const [prompt, setPrompt] = useState(currentPrompt || DEFAULT_TRANSITION_PROMPT);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleConfirm = useCallback(() => {
    onConfirm(prompt);
  }, [prompt, onConfirm]);

  const handleResetPrompt = useCallback(() => {
    setPrompt(DEFAULT_TRANSITION_PROMPT);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-gray-900 rounded-2xl p-6 max-w-lg w-full mx-4 border border-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-white mb-4">Regenerate Transition</h2>

        {/* Transition preview */}
        <div className="flex items-center justify-center gap-3 mb-5">
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-20 rounded-lg overflow-hidden bg-white/5 border border-white/10"
              style={{ aspectRatio: thumbAspect }}
            >
              {fromImageUrl && (
                <img
                  src={fromImageUrl}
                  alt="From"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <span className="text-xs text-gray-400 text-center max-w-[80px] truncate">{fromLabel}</span>
          </div>

          <svg className="w-6 h-6 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          <div className="flex flex-col items-center gap-1">
            <div
              className="w-20 rounded-lg overflow-hidden bg-white/5 border border-white/10"
              style={{ aspectRatio: thumbAspect }}
            >
              {toImageUrl && (
                <img
                  src={toImageUrl}
                  alt="To"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <span className="text-xs text-gray-400 text-center max-w-[80px] truncate">{toLabel}</span>
          </div>
        </div>

        {/* Prompt input */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">
              Transition Description
            </label>
            <button
              type="button"
              onClick={handleResetPrompt}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Reset to Default
            </button>
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe how the transition should look..."
            rows={4}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
          />
          <p className="mt-2 text-xs text-gray-500">
            Customize how the camera moves between these two angles.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors min-h-[44px]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors min-h-[44px] flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransitionRegenerateModal;
