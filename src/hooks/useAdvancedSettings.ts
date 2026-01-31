/**
 * Advanced Settings Hook
 *
 * Manages global image generation settings that persist to localStorage.
 * These settings affect all angle generation workflows.
 */

import { useState, useEffect, useCallback } from 'react';
import type { ImageModelId } from '../types';
import {
  CAMERA_ANGLE_MODEL,
  IMAGE_MODELS,
  getModelConfig
} from '../constants/cameraAngleSettings';

const STORAGE_KEY = 'sogni360_advanced_settings';

export interface AdvancedSettings {
  imageModel: ImageModelId;
  imageSteps: number;
  imageGuidance: number;
}

const getDefaultSettings = (): AdvancedSettings => {
  const defaultModel = getModelConfig(CAMERA_ANGLE_MODEL as ImageModelId);
  return {
    imageModel: CAMERA_ANGLE_MODEL as ImageModelId,
    imageSteps: defaultModel.steps.default,
    imageGuidance: defaultModel.guidance.default
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

      return { imageModel: modelId, imageSteps: steps, imageGuidance: guidance };
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
    globalSettings = {
      imageModel: modelId,
      imageSteps: modelConfig.steps.default,
      imageGuidance: modelConfig.guidance.default
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
    globalSettings = { ...globalSettings, imageSteps: clampedSteps };
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
    resetToDefaults,
    getCurrentModelConfig,
    modelConfigs: IMAGE_MODELS
  };
}

// Export function to get current settings synchronously (for generation code)
export function getAdvancedSettings(): AdvancedSettings {
  return globalSettings;
}
