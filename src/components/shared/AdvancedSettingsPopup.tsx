/**
 * Advanced Settings Popup
 *
 * Allows users to configure:
 * - Photo quality tier (Fast, Balanced, High Quality, Pro)
 * - Video quality tier (Fast, Balanced, High Quality, Pro)
 * - Advanced: Primary image model (Lightning vs Standard Qwen)
 * - Advanced: Inference steps (within model-specific ranges)
 * - Advanced: Guidance scale (within model-specific ranges)
 */

import React, { useCallback, useState } from 'react';
import { useAdvancedSettings } from '../../hooks/useAdvancedSettings';
import { PHOTO_QUALITY_PRESETS, type PhotoQualityTier } from '../../constants/cameraAngleSettings';
import { VIDEO_QUALITY_PRESETS, type VideoQualityPreset } from '../../constants/videoSettings';
import type { ImageModelId, OutputFormat } from '../../types';
import '../../styles/components/AdvancedSettingsPopup.css';

interface AdvancedSettingsPopupProperties {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdvancedSettingsPopup({
  isOpen,
  onClose
}: AdvancedSettingsPopupProperties) {
  const {
    settings,
    setModel,
    setSteps,
    setGuidance,
    setPhotoQuality,
    setVideoQuality,
    setVideoNegativePrompt,
    setOutputFormat,
    resetToDefaults,
    getCurrentModelConfig,
    modelConfigs,
    defaultVideoNegativePrompt
  } = useAdvancedSettings();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const currentModelConfig = getCurrentModelConfig();

  const handlePhotoQualityChange = useCallback((quality: PhotoQualityTier) => {
    setPhotoQuality(quality);
  }, [setPhotoQuality]);

  const handleVideoQualityChange = useCallback((quality: VideoQualityPreset) => {
    setVideoQuality(quality);
  }, [setVideoQuality]);

  const handleModelChange = useCallback((modelId: ImageModelId) => {
    setModel(modelId);
  }, [setModel]);

  const handleStepsChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSteps(Number.parseInt(event.target.value, 10));
  }, [setSteps]);

  const handleGuidanceChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setGuidance(Number.parseFloat(event.target.value));
  }, [setGuidance]);

  const handleVideoNegativePromptChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setVideoNegativePrompt(event.target.value);
  }, [setVideoNegativePrompt]);

  const handleOutputFormatChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setOutputFormat(event.target.value as OutputFormat);
  }, [setOutputFormat]);

  const handleResetVideoNegativePrompt = useCallback(() => {
    setVideoNegativePrompt(defaultVideoNegativePrompt);
  }, [setVideoNegativePrompt, defaultVideoNegativePrompt]);

  const handleOverlayClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleReset = useCallback(() => {
    resetToDefaults();
  }, [resetToDefaults]);

  if (!isOpen) return;

  return (
    <div className="advanced-settings-overlay" onClick={handleOverlayClick}>
      <div className="advanced-settings-popup">
        <div className="advanced-settings-header">
          <h2>Advanced Settings</h2>
          <button className="advanced-settings-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="advanced-settings-content">
          {/* Photo Quality Tier */}
          <div className="settings-section">
            <label className="settings-label">Photo Quality</label>
            <p className="settings-description">
              Quality level for camera angle image generation
            </p>
            <div className="quality-tier-options">
              {(Object.keys(PHOTO_QUALITY_PRESETS) as PhotoQualityTier[]).map((key) => (
                <button
                  key={key}
                  className={`quality-tier-option ${settings.photoQuality === key ? 'active' : ''}`}
                  onClick={() => handlePhotoQualityChange(key)}
                >
                  <span className="quality-tier-label">{PHOTO_QUALITY_PRESETS[key].label}</span>
                </button>
              ))}
            </div>
            <p className="quality-tier-description">
              {PHOTO_QUALITY_PRESETS[settings.photoQuality].description}
            </p>
          </div>

          {/* Video Quality Tier */}
          <div className="settings-section">
            <label className="settings-label">Video Quality</label>
            <p className="settings-description">
              Quality level for transition video generation
            </p>
            <div className="quality-tier-options">
              {(Object.keys(VIDEO_QUALITY_PRESETS) as VideoQualityPreset[]).map((key) => (
                <button
                  key={key}
                  className={`quality-tier-option ${settings.videoQuality === key ? 'active' : ''}`}
                  onClick={() => handleVideoQualityChange(key)}
                >
                  <span className="quality-tier-label">{VIDEO_QUALITY_PRESETS[key].label}</span>
                </button>
              ))}
            </div>
            <p className="quality-tier-description">
              {VIDEO_QUALITY_PRESETS[settings.videoQuality].description}
            </p>
          </div>

          {/* Advanced Toggle */}
          <button
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span>Fine-tune settings</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showAdvanced && (
            <>
              {/* Model Selection */}
              <div className="settings-section">
                <label className="settings-label">Image Model</label>
                <p className="settings-description">
                  Choose between fast generation or higher quality output
                </p>
                <div className="model-options">
                  {Object.values(modelConfigs).map((model) => (
                    <button
                      key={model.id}
                      className={`model-option ${settings.imageModel === model.id ? 'active' : ''}`}
                      onClick={() => handleModelChange(model.id)}
                    >
                      <div className="model-option-content">
                        <span className="model-name">{model.label}</span>
                        <span className="model-description">{model.description}</span>
                      </div>
                      {settings.imageModel === model.id && (
                        <svg className="model-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inference Steps */}
              <div className="settings-section">
                <label className="settings-label">
                  Inference Steps
                  <span className="settings-value">{settings.imageSteps}</span>
                </label>
                <p className="settings-description">
                  More steps = higher quality but slower generation
                  ({currentModelConfig.steps.min}-{currentModelConfig.steps.max} for this model)
                </p>
                <div className="slider-container">
                  <input
                    type="range"
                    min={currentModelConfig.steps.min}
                    max={currentModelConfig.steps.max}
                    step={1}
                    value={settings.imageSteps}
                    onChange={handleStepsChange}
                    className="settings-slider"
                  />
                  <div className="slider-labels">
                    <span>{currentModelConfig.steps.min}</span>
                    <span>{currentModelConfig.steps.max}</span>
                  </div>
                </div>
              </div>

              {/* Guidance Scale */}
              <div className="settings-section">
                <label className="settings-label">
                  Guidance Scale
                  <span className="settings-value">{settings.imageGuidance.toFixed(1)}</span>
                </label>
                <p className="settings-description">
                  How closely to follow the prompt (higher = more literal)
                  ({currentModelConfig.guidance.min}-{currentModelConfig.guidance.max} for this model)
                </p>
                <div className="slider-container">
                  <input
                    type="range"
                    min={currentModelConfig.guidance.min}
                    max={currentModelConfig.guidance.max}
                    step={0.1}
                    value={settings.imageGuidance}
                    onChange={handleGuidanceChange}
                    className="settings-slider"
                  />
                  <div className="slider-labels">
                    <span>{currentModelConfig.guidance.min}</span>
                    <span>{currentModelConfig.guidance.max}</span>
                  </div>
                </div>
              </div>

              {/* Output Format */}
              <div className="settings-section">
                <label className="settings-label">Output Format</label>
                <p className="settings-description">
                  PNG is lossless (larger files), JPG is compressed (smaller files).
                  Auto-switches to PNG for High Quality and Pro tiers.
                </p>
                <select
                  className="settings-select"
                  value={settings.outputFormat}
                  onChange={handleOutputFormatChange}
                >
                  <option value="jpg">JPG (Smaller files, web-optimized)</option>
                  <option value="png">PNG (Lossless, larger files)</option>
                </select>
              </div>

              {/* Video Negative Prompt */}
              <div className="settings-section">
                <div className="settings-label-row">
                  <label className="settings-label">Video Negative Prompt</label>
                  {settings.videoNegativePrompt !== defaultVideoNegativePrompt && (
                    <button
                      className="reset-field-button"
                      onClick={handleResetVideoNegativePrompt}
                      title="Reset to default"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <p className="settings-description">
                  Things to avoid in video transitions. Default is in Chinese (recommended for WAN model).
                </p>
                <textarea
                  className="settings-textarea"
                  value={settings.videoNegativePrompt}
                  onChange={handleVideoNegativePromptChange}
                  rows={3}
                  placeholder="Enter negative prompt for video generation..."
                />
              </div>
            </>
          )}

          {/* Info Box */}
          <div className="settings-info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <p>
              These settings apply to all new generations. Higher quality takes longer but produces better results.
            </p>
          </div>
        </div>

        <div className="advanced-settings-footer">
          <button className="reset-button" onClick={handleReset}>
            Reset to Defaults
          </button>
          <button className="done-button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
