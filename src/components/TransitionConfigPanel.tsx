import React, { useState, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import type { Segment } from '../types';
import { v4 as uuidv4 } from 'uuid';
import {
  VIDEO_QUALITY_PRESETS,
  VIDEO_RESOLUTIONS,
  VIDEO_CONFIG,
  VideoQualityPreset,
  VideoResolution
} from '../constants/videoSettings';

// Cost estimation constants
const SPARK_PER_SECOND = 3.92; // Approximate spark cost per second of video
const USD_PER_SPARK = 0.005;

// Default transition prompt
const DEFAULT_TRANSITION_PROMPT = `Cinematic transition shot between starting image person and environment to the ending image person and environment. Preserve the same subject identity and facial structure. Use a premium artistic transition or transformation, dynamic action, and atmospheric lighting. Seamless camera movement.`;

interface TransitionConfigPanelProps {
  onClose: () => void;
  onStartGeneration: () => void;
}

const TransitionConfigPanel: React.FC<TransitionConfigPanelProps> = ({
  onClose,
  onStartGeneration
}) => {
  const { state, dispatch } = useApp();
  const { showToast } = useToast();
  const { currentProject } = state;

  // Local state for configuration
  const [transitionPrompt, setTransitionPrompt] = useState(
    currentProject?.settings.transitionPrompt || DEFAULT_TRANSITION_PROMPT
  );
  const [resolution, setResolution] = useState<VideoResolution>(
    (currentProject?.settings.videoResolution as VideoResolution) || '480p'
  );
  const [duration, setDuration] = useState(
    currentProject?.settings.transitionDuration || 1.5
  );
  const [quality, setQuality] = useState<VideoQualityPreset>(
    (currentProject?.settings.transitionQuality as VideoQualityPreset) || 'fast'
  );

  const waypoints = currentProject?.waypoints || [];
  const readyWaypoints = waypoints.filter(wp => wp.status === 'ready' && wp.imageUrl);

  // Calculate number of transitions needed (between consecutive waypoints, looping back)
  const transitionCount = readyWaypoints.length >= 2 ? readyWaypoints.length : 0;

  // Calculate cost estimate
  const totalSeconds = transitionCount * duration;
  const totalSpark = totalSeconds * SPARK_PER_SECOND;
  const totalUsd = totalSpark * USD_PER_SPARK;

  // Duration options
  const durationOptions = useMemo(() => {
    const options = [];
    for (let d = VIDEO_CONFIG.minDuration; d <= VIDEO_CONFIG.maxDuration; d += VIDEO_CONFIG.durationStep) {
      options.push(d);
    }
    return options;
  }, []);

  // Handle start generation
  const handleStartGeneration = useCallback(() => {
    if (readyWaypoints.length < 2) {
      showToast({ message: 'Need at least 2 ready angles to create transitions', type: 'warning' });
      return;
    }

    // Save settings to project
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        transitionPrompt,
        videoResolution: resolution,
        transitionDuration: duration,
        transitionQuality: quality
      }
    });

    // Create segments for each transition
    const newSegments: Segment[] = [];
    for (let i = 0; i < readyWaypoints.length; i++) {
      const fromWaypoint = readyWaypoints[i];
      const toWaypoint = readyWaypoints[(i + 1) % readyWaypoints.length]; // Loop back to first

      newSegments.push({
        id: uuidv4(),
        fromWaypointId: fromWaypoint.id,
        toWaypointId: toWaypoint.id,
        status: 'pending',
        versions: []
      });
    }

    // Set segments in project
    dispatch({ type: 'SET_SEGMENTS', payload: newSegments });

    // Trigger generation
    onStartGeneration();
  }, [readyWaypoints, transitionPrompt, resolution, duration, quality, dispatch, showToast, onStartGeneration]);

  return (
    <div className="transition-config-panel">
      {/* Header */}
      <div className="config-header">
        <div className="config-header-left">
          <div className="config-icon">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
          </div>
          <div className="config-title-group">
            <h2 className="config-title">Transition Video</h2>
            <p className="config-subtitle">Generate a sweet looping transition video between all images.</p>
          </div>
        </div>
        <button className="config-close-btn" onClick={onClose}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Configuration form */}
      <div className="config-body">
        {/* Transition Prompt */}
        <div className="config-section">
          <label className="config-label">
            <span className="label-icon">✨</span>
            TRANSITION PROMPT
          </label>
          <textarea
            className="config-textarea"
            value={transitionPrompt}
            onChange={(e) => setTransitionPrompt(e.target.value)}
            placeholder="Describe the transition style..."
            rows={4}
          />
        </div>

        {/* Generate Button */}
        <button
          className="generate-btn"
          onClick={handleStartGeneration}
          disabled={readyWaypoints.length < 2}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
          Generate Transition Video
        </button>

        {/* Settings bar */}
        <div className="config-settings-bar">
          <div className="settings-left">
            <span className="setting-item">
              <span className="setting-icon">🎬</span>
              {transitionCount} videos
            </span>
            <span className="setting-divider">·</span>

            {/* Resolution selector */}
            <select
              className="setting-select"
              value={resolution}
              onChange={(e) => setResolution(e.target.value as VideoResolution)}
            >
              {Object.entries(VIDEO_RESOLUTIONS).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
            <span className="setting-divider">·</span>

            {/* Duration selector */}
            <select
              className="setting-select"
              value={duration}
              onChange={(e) => setDuration(parseFloat(e.target.value))}
            >
              {durationOptions.map((d) => (
                <option key={d} value={d}>{d}s</option>
              ))}
            </select>
            <span className="setting-divider">·</span>

            {/* Quality selector */}
            <select
              className="setting-select"
              value={quality}
              onChange={(e) => setQuality(e.target.value as VideoQualityPreset)}
            >
              {Object.entries(VIDEO_QUALITY_PRESETS).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>

          <div className="settings-right">
            <span className="cost-spark">{totalSpark.toFixed(2)} Spark</span>
            <span className="cost-usd">≈ ${totalUsd.toFixed(2)} USD</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransitionConfigPanel;
