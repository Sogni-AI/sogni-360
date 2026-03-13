/**
 * Fine-tune settings section for Advanced Settings popup.
 * Contains image model, inference steps, guidance, output format, and video negative prompt.
 */

import React, { useCallback } from 'react';
import type { ImageModelId, OutputFormat } from '../../types';

interface ModelConfig {
  steps: { min: number; max: number };
  guidance: { min: number; max: number; decimals: number };
}

interface ModelInfo {
  id: ImageModelId;
  label: string;
  description: string;
}

interface FineTuneProps {
  imageModel: ImageModelId;
  imageSteps: number;
  imageGuidance: number;
  outputFormat: OutputFormat;
  videoNegativePrompt: string;
  videoModel: string;
  defaultVideoNegativePrompt: string;
  currentModelConfig: ModelConfig;
  modelConfigs: Record<string, ModelInfo>;
  onModelChange: (modelId: ImageModelId) => void;
  onStepsChange: (steps: number) => void;
  onGuidanceChange: (guidance: number) => void;
  onOutputFormatChange: (format: OutputFormat) => void;
  onVideoNegativePromptChange: (prompt: string) => void;
}

export default function AdvancedSettingsFineTune({
  imageModel,
  imageSteps,
  imageGuidance,
  outputFormat,
  videoNegativePrompt,
  videoModel,
  defaultVideoNegativePrompt,
  currentModelConfig,
  modelConfigs,
  onModelChange,
  onStepsChange,
  onGuidanceChange,
  onOutputFormatChange,
  onVideoNegativePromptChange
}: FineTuneProps) {
  const handleSteps = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onStepsChange(Number.parseInt(e.target.value, 10));
  }, [onStepsChange]);

  const handleGuidance = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onGuidanceChange(Number.parseFloat(e.target.value));
  }, [onGuidanceChange]);

  const handleFormat = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onOutputFormatChange(e.target.value as OutputFormat);
  }, [onOutputFormatChange]);

  const handlePrompt = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onVideoNegativePromptChange(e.target.value);
  }, [onVideoNegativePromptChange]);

  return (
    <>
      {/* Image Model Selection */}
      <div className="settings-section">
        <label className="settings-label">Image Model</label>
        <p className="settings-description">
          Choose between fast generation or higher quality output
        </p>
        <div className="model-options">
          {Object.values(modelConfigs).map((model) => (
            <button
              key={model.id}
              className={`model-option ${imageModel === model.id ? 'active' : ''}`}
              onClick={() => onModelChange(model.id)}
            >
              <div className="model-option-content">
                <span className="model-name">{model.label}</span>
                <span className="model-description">{model.description}</span>
              </div>
              {imageModel === model.id && (
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
          <span className="settings-value">{imageSteps}</span>
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
            value={imageSteps}
            onChange={handleSteps}
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
          <span className="settings-value">{imageGuidance.toFixed(1)}</span>
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
            value={imageGuidance}
            onChange={handleGuidance}
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
          value={outputFormat}
          onChange={handleFormat}
        >
          <option value="jpg">JPG (Smaller files, web-optimized)</option>
          <option value="png">PNG (Lossless, larger files)</option>
        </select>
      </div>

      {/* Video Negative Prompt */}
      <div className="settings-section">
        <div className="settings-label-row">
          <label className="settings-label">Video Negative Prompt</label>
          {videoNegativePrompt !== defaultVideoNegativePrompt && (
            <button
              className="reset-field-button"
              onClick={() => onVideoNegativePromptChange(defaultVideoNegativePrompt)}
              title="Reset to default"
            >
              Reset
            </button>
          )}
        </div>
        <p className="settings-description">
          Things to avoid in video transitions.
          {videoModel === 'wan2.2' ? ' Default is in Chinese (recommended for WAN model).' : ''}
        </p>
        <textarea
          className="settings-textarea"
          value={videoNegativePrompt}
          onChange={handlePrompt}
          rows={3}
          placeholder="Enter negative prompt for video generation..."
        />
      </div>
    </>
  );
}
