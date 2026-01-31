/**
 * Advanced Settings Popup
 *
 * Allows users to configure:
 * - Primary image model (Lightning vs Standard Qwen)
 * - Inference steps (within model-specific ranges)
 * - Guidance scale (within model-specific ranges)
 */

import React, { useCallback } from 'react';
import { useAdvancedSettings } from '../../hooks/useAdvancedSettings';
import type { ImageModelId } from '../../types';
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
    resetToDefaults,
    getCurrentModelConfig,
    modelConfigs
  } = useAdvancedSettings();

  const currentModelConfig = getCurrentModelConfig();

  const handleModelChange = useCallback((modelId: ImageModelId) => {
    setModel(modelId);
  }, [setModel]);

  const handleStepsChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSteps(Number.parseInt(event.target.value, 10));
  }, [setSteps]);

  const handleGuidanceChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setGuidance(Number.parseFloat(event.target.value));
  }, [setGuidance]);

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
          {/* Model Selection */}
          <div className="settings-section">
            <label className="settings-label">Primary Image Model</label>
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

          {/* Info Box */}
          <div className="settings-info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <p>
              These settings apply to all angle generations, including regenerations.
              Higher steps with the standard model produces the best quality but takes longer.
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
