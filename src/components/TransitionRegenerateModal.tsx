import React, { useEffect, useCallback } from 'react';
import type { VideoQualityPreset, VideoResolution } from '../constants/videoSettings';
import { useTransitionRegenerate } from '../hooks/useTransitionRegenerate';

interface TransitionRegenerateModalProps {
  fromLabel: string;
  toLabel: string;
  fromImageUrl?: string;
  toImageUrl?: string;
  thumbAspect: number;
  currentPrompt?: string;
  /** Source image dimensions for cost estimation */
  imageWidth?: number;
  imageHeight?: number;
  /** Video settings for cost estimation */
  resolution?: VideoResolution;
  quality?: VideoQualityPreset;
  duration?: number;
  tokenType?: 'spark' | 'sogni';
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
  imageWidth,
  imageHeight,
  resolution,
  quality,
  duration,
  tokenType = 'spark',
  onConfirm,
  onCancel
}) => {
  const regen = useTransitionRegenerate({
    currentPrompt, fromImageUrl, toImageUrl, fromLabel, toLabel,
    imageWidth, imageHeight, resolution, quality, duration, tokenType,
  });

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleConfirm = useCallback(() => {
    onConfirm(regen.prompt);
  }, [regen.prompt, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-gradient-to-br from-[rgba(17,24,39,0.98)] to-[rgba(3,7,18,0.98)] rounded-2xl p-6 max-w-lg w-full mx-4 border border-white/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]"
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
                <img src={fromImageUrl} alt="From" className="w-full h-full object-cover" />
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
                <img src={toImageUrl} alt="To" className="w-full h-full object-cover" />
              )}
            </div>
            <span className="text-xs text-gray-400 text-center max-w-[80px] truncate">{toLabel}</span>
          </div>
        </div>

        {/* Prompt input */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">Transition Description</label>
            <button
              type="button"
              onClick={regen.handleResetPrompt}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Reset to Default
            </button>
          </div>

          {/* Preset dropdown */}
          <div className="mb-3">
            <select
              value={regen.selectedPresetId}
              onChange={(e) => regen.handlePresetChange(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 cursor-pointer"
            >
              {regen.visiblePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} — {preset.description}
                </option>
              ))}
              {regen.selectedPresetId === 'custom' && (
                <option value="custom">Custom</option>
              )}
            </select>
          </div>

          <textarea
            value={regen.prompt}
            onChange={(event) => regen.setPrompt(event.target.value)}
            placeholder="Describe how the transition should look..."
            rows={4}
            readOnly={regen.isAnalyzingAI}
            className={`w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30${regen.isAnalyzingAI ? ' opacity-60' : ''}`}
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Select a preset above or customize the prompt.
            </p>
            {regen.showAIButton && (
              <button
                type="button"
                onClick={regen.handleAnalyzeWithAI}
                disabled={regen.isAnalyzingAI || !fromImageUrl || !toImageUrl}
                className="text-xs text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap ml-3"
              >
                {regen.isAnalyzingAI ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" />
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Analyze with AI
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Clip settings summary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-gray-400">
          {regen.videoDimensions && (
            <span>
              <span className="text-gray-500">Resolution</span>{' '}
              <span className="text-gray-300">{regen.videoDimensions.width}×{regen.videoDimensions.height}</span>
            </span>
          )}
          <span>
            <span className="text-gray-500">Quality</span>{' '}
            <span className="text-gray-300">{regen.qualityConfig.label}</span>
          </span>
          <span>
            <span className="text-gray-500">Duration</span>{' '}
            <span className="text-gray-300">{regen.effectiveDuration}s</span>
          </span>
          <span>
            <span className="text-gray-500">FPS</span>{' '}
            <span className="text-gray-300">{regen.effectiveFps}</span>
          </span>
        </div>

        {/* Cost estimate + Action buttons */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-400">
            {regen.costLoading ? (
              <span className="text-gray-500">Calculating cost...</span>
            ) : regen.formattedCost !== '—' ? (
              <span>
                <span className="text-white font-medium">{regen.formattedCost} {tokenType.toUpperCase()}</span>
                <span className="text-gray-500 ml-1.5">≈ {regen.formattedUSD}</span>
              </span>
            ) : null}
          </div>
          <div className="flex gap-3">
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
    </div>
  );
};

export default TransitionRegenerateModal;
