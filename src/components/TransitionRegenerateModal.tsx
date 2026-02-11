import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TRANSITION_PROMPT_PRESETS,
  getDefaultTransitionPrompt,
  findPresetByPrompt
} from '../constants/transitionPromptPresets';
import { useVideoCostEstimation } from '../hooks/useVideoCostEstimation';
import {
  VIDEO_QUALITY_PRESETS,
  VIDEO_CONFIG,
  DEFAULT_VIDEO_SETTINGS,
  calculateVideoDimensions,
} from '../constants/videoSettings';
import type { VideoQualityPreset, VideoResolution } from '../constants/videoSettings';

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
  const defaultPrompt = getDefaultTransitionPrompt();
  const [prompt, setPrompt] = useState(currentPrompt || defaultPrompt);

  // Resolve settings with defaults
  const effectiveResolution = resolution || DEFAULT_VIDEO_SETTINGS.resolution;
  const effectiveQuality = quality || DEFAULT_VIDEO_SETTINGS.quality;
  const effectiveDuration = duration || VIDEO_CONFIG.defaultDuration;
  const effectiveFps = DEFAULT_VIDEO_SETTINGS.fps;
  const qualityConfig = VIDEO_QUALITY_PRESETS[effectiveQuality];

  // Compute actual video dimensions for display
  const videoDimensions = useMemo(() => {
    if (!imageWidth || !imageHeight) return null;
    return calculateVideoDimensions(imageWidth, imageHeight, effectiveResolution);
  }, [imageWidth, imageHeight, effectiveResolution]);

  // Cost estimation for a single transition regeneration
  const { loading: costLoading, formattedCost, formattedUSD } = useVideoCostEstimation({
    imageWidth,
    imageHeight,
    resolution,
    quality,
    duration,
    jobCount: 1,
    tokenType,
    enabled: !!(imageWidth && imageHeight)
  });

  // Determine if current prompt matches a preset (for dropdown display)
  const selectedPresetId = useMemo(() => {
    const preset = findPresetByPrompt(prompt);
    return preset?.id || 'custom';
  }, [prompt]);

  // Handle preset selection
  const handlePresetChange = useCallback((presetId: string) => {
    if (presetId === 'custom') return; // Don't change prompt when selecting "Custom"
    const preset = TRANSITION_PROMPT_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setPrompt(preset.prompt);
    }
  }, []);

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
    setPrompt(defaultPrompt);
  }, [defaultPrompt]);

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

          {/* Preset dropdown */}
          <div className="mb-3">
            <select
              value={selectedPresetId}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 cursor-pointer"
            >
              {TRANSITION_PROMPT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} — {preset.description}
                </option>
              ))}
              {selectedPresetId === 'custom' && (
                <option value="custom">Custom</option>
              )}
            </select>
          </div>

          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe how the transition should look..."
            rows={4}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
          />
          <p className="mt-2 text-xs text-gray-500">
            Select a preset above or customize the prompt. Editing the text will switch to Custom mode.
          </p>
        </div>

        {/* Clip settings summary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-gray-400">
          {videoDimensions && (
            <span>
              <span className="text-gray-500">Resolution</span>{' '}
              <span className="text-gray-300">{videoDimensions.width}×{videoDimensions.height}</span>
            </span>
          )}
          <span>
            <span className="text-gray-500">Quality</span>{' '}
            <span className="text-gray-300">{qualityConfig.label}</span>
          </span>
          <span>
            <span className="text-gray-500">Duration</span>{' '}
            <span className="text-gray-300">{effectiveDuration}s</span>
          </span>
          <span>
            <span className="text-gray-500">FPS</span>{' '}
            <span className="text-gray-300">{effectiveFps}</span>
          </span>
        </div>

        {/* Cost estimate + Action buttons */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-400">
            {costLoading ? (
              <span className="text-gray-500">Calculating cost...</span>
            ) : formattedCost !== '—' ? (
              <span>
                <span className="text-white font-medium">{formattedCost} {tokenType.toUpperCase()}</span>
                <span className="text-gray-500 ml-1.5">≈ {formattedUSD}</span>
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
