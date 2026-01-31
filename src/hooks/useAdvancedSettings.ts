/**
 * Advanced Settings Hook
 *
 * Manages global image generation settings that persist to localStorage.
 * These settings affect all angle generation workflows.
 */

import { useState, useEffect, useCallback } from 'react';
import type { ImageModelId, VideoQualityPreset } from '../types';
import {
  IMAGE_MODELS,
  getModelConfig,
  PHOTO_QUALITY_PRESETS,
  getPhotoQualityTier,
  type PhotoQualityTier
} from '../constants/cameraAngleSettings';

const STORAGE_KEY = 'sogni360_advanced_settings';

export interface AdvancedSettings {
  imageModel: ImageModelId;
  imageSteps: number;
  imageGuidance: number;
  photoQuality: PhotoQualityTier;
  videoQuality: VideoQualityPreset;
}

const getDefaultSettings = (): AdvancedSettings => {
  // Default to 'balanced' quality tier (Lightning model, 8 steps)
  const balancedPreset = PHOTO_QUALITY_PRESETS.balanced;
  return {
    imageModel: balancedPreset.model,
    imageSteps: balancedPreset.steps,
    imageGuidance: balancedPreset.guidance,
    photoQuality: 'balanced',
    videoQuality: 'balanced'
  };
};

const loadSettings = (): AdvancedSettings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<AdvancedSettings>;
      const defaults = getDefaultSettings();

      // Validate model ID
      const modelId = parsed.imageModel && IMAGE_MODELS[parsed.imageModel]
        ? parsed.imageModel
        : defaults.imageModel;

      const modelConfig = getModelConfig(modelId);

      // Validate steps within model range
      let steps = parsed.imageSteps ?? defaults.imageSteps;
      steps = Math.max(modelConfig.steps.min, Math.min(modelConfig.steps.max, steps));

      // Validate guidance within model range
      let guidance = parsed.imageGuidance ?? defaults.imageGuidance;
      guidance = Math.max(modelConfig.guidance.min, Math.min(modelConfig.guidance.max, guidance));

      // Validate quality tiers
      const photoQuality = parsed.photoQuality && PHOTO_QUALITY_PRESETS[parsed.photoQuality]
        ? parsed.photoQuality
        : getPhotoQualityTier(modelId, steps) || defaults.photoQuality;

      const videoQuality = parsed.videoQuality && ['fast', 'balanced', 'quality', 'pro'].includes(parsed.videoQuality)
        ? parsed.videoQuality
        : defaults.videoQuality;

      return { imageModel: modelId, imageSteps: steps, imageGuidance: guidance, photoQuality, videoQuality };
    }
  } catch {
    // Ignore parse errors
  }
  return getDefaultSettings();
};

const saveSettings = (settings: AdvancedSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
};

// Singleton pattern for cross-component state sync
let globalSettings = loadSettings();
const listeners = new Set<(settings: AdvancedSettings) => void>();

const notifyListeners = () => {
  for (const listener of listeners) {
    listener(globalSettings);
  }
};

export function useAdvancedSettings() {
  const [settings, setSettingsState] = useState<AdvancedSettings>(globalSettings);

  // Subscribe to changes
  useEffect(() => {
    const listener = (newSettings: AdvancedSettings) => {
      setSettingsState(newSettings);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setSettings = useCallback((updates: Partial<AdvancedSettings>) => {
    globalSettings = { ...globalSettings, ...updates };
    saveSettings(globalSettings);
    notifyListeners();
  }, []);

  const setModel = useCallback((modelId: ImageModelId) => {
    const modelConfig = getModelConfig(modelId);
    // Reset steps and guidance to model defaults when switching models
    const newSteps = modelConfig.steps.default;
    const photoQuality = getPhotoQualityTier(modelId, newSteps) || globalSettings.photoQuality;
    globalSettings = {
      ...globalSettings,
      imageModel: modelId,
      imageSteps: newSteps,
      imageGuidance: modelConfig.guidance.default,
      photoQuality
    };
    saveSettings(globalSettings);
    notifyListeners();
  }, []);

  const setPhotoQuality = useCallback((quality: PhotoQualityTier) => {
    const preset = PHOTO_QUALITY_PRESETS[quality];
    globalSettings = {
      ...globalSettings,
      imageModel: preset.model,
      imageSteps: preset.steps,
      imageGuidance: preset.guidance,
      photoQuality: quality
    };
    saveSettings(globalSettings);
    notifyListeners();
  }, []);

  const setVideoQuality = useCallback((quality: VideoQualityPreset) => {
    globalSettings = {
      ...globalSettings,
      videoQuality: quality
    };
    saveSettings(globalSettings);
    notifyListeners();
  }, []);

  const setSteps = useCallback((steps: number) => {
    const modelConfig = getModelConfig(globalSettings.imageModel);
    const clampedSteps = Math.max(
      modelConfig.steps.min,
      Math.min(modelConfig.steps.max, steps)
    );
    // Update photoQuality tier based on new steps
    const photoQuality = getPhotoQualityTier(globalSettings.imageModel, clampedSteps) || globalSettings.photoQuality;
    globalSettings = { ...globalSettings, imageSteps: clampedSteps, photoQuality };
    saveSettings(globalSettings);
    notifyListeners();
  }, []);

  const setGuidance = useCallback((guidance: number) => {
    const modelConfig = getModelConfig(globalSettings.imageModel);
    // Clamp and round to proper decimal places
    const clampedGuidance = Math.max(
      modelConfig.guidance.min,
      Math.min(modelConfig.guidance.max, guidance)
    );
    const decimals = modelConfig.guidance.decimals;
    const roundedGuidance = Math.round(clampedGuidance * 10 ** decimals) / 10 ** decimals;
    globalSettings = { ...globalSettings, imageGuidance: roundedGuidance };
    saveSettings(globalSettings);
    notifyListeners();
  }, []);

  const resetToDefaults = useCallback(() => {
    globalSettings = getDefaultSettings();
    saveSettings(globalSettings);
    notifyListeners();
  }, []);

  const getCurrentModelConfig = useCallback(() => {
    return getModelConfig(settings.imageModel);
  }, [settings.imageModel]);

  return {
    settings,
    setSettings,
    setModel,
    setSteps,
    setGuidance,
    setPhotoQuality,
    setVideoQuality,
    resetToDefaults,
    getCurrentModelConfig,
    modelConfigs: IMAGE_MODELS,
    photoQualityPresets: PHOTO_QUALITY_PRESETS
  };
}

// Export function to get current settings synchronously (for generation code)
export function getAdvancedSettings(): AdvancedSettings {
  return globalSettings;
}
