/**
 * Advanced Settings Popup
 *
 * Allows users to configure:
 * - Photo quality tier (Fast, Balanced, High Quality, Pro)
 * - Video model (WAN 2.2, LTX-2.3)
 * - Video quality tier (Fast, Balanced, High Quality, Pro)
 * - Advanced fine-tune: image model, steps, guidance, output format, negative prompt
 */

import React, { useCallback, useState } from 'react';
import { useAdvancedSettings } from '../../hooks/useAdvancedSettings';
import { LiquidGlassPanel } from './LiquidGlassPanel';
import AdvancedSettingsFineTune from './AdvancedSettingsFineTune';
import { PHOTO_QUALITY_PRESETS, type PhotoQualityTier } from '../../constants/cameraAngleSettings';
import {
  VIDEO_MODEL_FAMILIES,
  type VideoModelFamily,
  type VideoQualityPreset,
  getVideoQualityConfig
} from '../../constants/videoSettings';
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
    setVideoModel,
    setVideoNegativePrompt,
    setOutputFormat,
    resetToDefaults,
    getCurrentModelConfig,
    modelConfigs,
    defaultVideoNegativePrompt
  } = useAdvancedSettings();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleOverlayClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) onClose();
  }, [onClose]);

  if (!isOpen) return;

  return (
    <div className="advanced-settings-overlay" onClick={handleOverlayClick}>
      <LiquidGlassPanel
        cornerRadius={24}
        modalTint
        className="advanced-settings-glass"
        style={{ width: '100%', maxWidth: '440px', maxHeight: '90vh' }}
      >
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
                  onClick={() => setPhotoQuality(key)}
                >
                  <span className="quality-tier-label">{PHOTO_QUALITY_PRESETS[key].label}</span>
                </button>
              ))}
            </div>
            <p className="quality-tier-description">
              {PHOTO_QUALITY_PRESETS[settings.photoQuality].description}
            </p>
          </div>

          {/* Video Model */}
          <div className="settings-section">
            <label className="settings-label">Video Model</label>
            <p className="settings-description">
              Generation model for transition videos
            </p>
            <div className="quality-tier-options">
              {(Object.keys(VIDEO_MODEL_FAMILIES) as VideoModelFamily[]).map((key) => (
                <button
                  key={key}
                  className={`quality-tier-option ${settings.videoModel === key ? 'active' : ''}`}
                  onClick={() => setVideoModel(key)}
                >
                  <span className="quality-tier-label">{VIDEO_MODEL_FAMILIES[key].label}</span>
                </button>
              ))}
            </div>
            <p className="quality-tier-description">
              {VIDEO_MODEL_FAMILIES[settings.videoModel].description}
            </p>
          </div>

          {/* Video Quality Tier — hidden for LTX-2.3 (single default quality) */}
          {settings.videoModel !== 'ltx2.3' && (
          <div className="settings-section">
            <label className="settings-label">Video Quality</label>
            <p className="settings-description">
              Quality level for transition video generation
            </p>
            <div className="quality-tier-options">
              {(['fast', 'balanced', 'quality', 'pro'] as VideoQualityPreset[]).map((key) => {
                const config = getVideoQualityConfig(key, settings.videoModel);
                return (
                  <button
                    key={key}
                    className={`quality-tier-option ${settings.videoQuality === key ? 'active' : ''}`}
                    onClick={() => setVideoQuality(key)}
                  >
                    <span className="quality-tier-label">{config.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="quality-tier-description">
              {getVideoQualityConfig(settings.videoQuality, settings.videoModel).description}
            </p>
          </div>
          )}

          {/* Advanced Toggle */}
          <button
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span>Fine-tune settings</span>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showAdvanced && (
            <AdvancedSettingsFineTune
              imageModel={settings.imageModel}
              imageSteps={settings.imageSteps}
              imageGuidance={settings.imageGuidance}
              outputFormat={settings.outputFormat}
              videoNegativePrompt={settings.videoNegativePrompt}
              videoModel={settings.videoModel}
              defaultVideoNegativePrompt={defaultVideoNegativePrompt}
              currentModelConfig={getCurrentModelConfig()}
              modelConfigs={modelConfigs}
              onModelChange={setModel}
              onStepsChange={setSteps}
              onGuidanceChange={setGuidance}
              onOutputFormatChange={setOutputFormat}
              onVideoNegativePromptChange={setVideoNegativePrompt}
            />
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
          <button className="reset-button" onClick={resetToDefaults}>
            Reset to Defaults
          </button>
          <button className="done-button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
      </LiquidGlassPanel>
    </div>
  );
}
