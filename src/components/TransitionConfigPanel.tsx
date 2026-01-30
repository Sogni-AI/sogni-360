import React, { useState, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import type { Segment, MusicSelection } from '../types';
import { v4 as uuidv4 } from 'uuid';
import {
  VIDEO_QUALITY_PRESETS,
  VIDEO_RESOLUTIONS,
  VIDEO_CONFIG,
  DEFAULT_VIDEO_SETTINGS,
  VideoQualityPreset,
  VideoResolution
} from '../constants/videoSettings';
import type { WorkflowStep } from './shared/WorkflowWizard';
import MusicSelector from './shared/MusicSelector';
import MusicConfigSection from './shared/MusicConfigSection';
import { warmUpAudio } from '../utils/sonicLogos';
import { useVideoCostEstimation } from '../hooks/useVideoCostEstimation';

// Default transition prompt
const DEFAULT_TRANSITION_PROMPT = `Smooth camera orbit around the subject. Preserve the same subject identity, facial structure, and environment. Seamless motion between camera angles with consistent lighting.`;

export interface TransitionGenerationSettings {
  resolution: VideoResolution;
  quality: VideoQualityPreset;
  duration: number;
  transitionPrompt: string;
  musicSelection?: MusicSelection;
}

interface TransitionConfigPanelProps {
  onClose: () => void;
  onStartGeneration: (segments: Segment[], settings: TransitionGenerationSettings) => void;
  onConfirmDestructiveAction?: (actionStep: WorkflowStep, onConfirm: () => void) => void;
}

const TransitionConfigPanel: React.FC<TransitionConfigPanelProps> = ({
  onClose,
  onStartGeneration,
  onConfirmDestructiveAction
}) => {
  const { state, dispatch } = useApp();
  const { showToast } = useToast();
  const { currentProject } = state;

  // Local state for configuration
  const [transitionPrompt, setTransitionPrompt] = useState(
    currentProject?.settings.transitionPrompt || DEFAULT_TRANSITION_PROMPT
  );
  const [resolution, setResolution] = useState<VideoResolution>(
    (currentProject?.settings.videoResolution as VideoResolution) || DEFAULT_VIDEO_SETTINGS.resolution
  );
  const [duration, setDuration] = useState(
    currentProject?.settings.transitionDuration || 1.5
  );
  const [quality, setQuality] = useState<VideoQualityPreset>(
    (currentProject?.settings.transitionQuality as VideoQualityPreset) || 'fast'
  );

  // Music state
  const [showMusicSelector, setShowMusicSelector] = useState(false);
  const [musicSelection, setMusicSelection] = useState<MusicSelection | null>(null);

  const waypoints = currentProject?.waypoints || [];
  const readyWaypoints = waypoints.filter(wp => wp.status === 'ready' && wp.imageUrl);

  // Calculate number of transitions needed (between consecutive waypoints, looping back)
  const transitionCount = readyWaypoints.length >= 2 ? readyWaypoints.length : 0;

  // Total video duration for all transitions
  const totalSeconds = transitionCount * duration;

  // Get cost estimate from Sogni API
  const { loading: costLoading, formattedCost, formattedUSD } = useVideoCostEstimation({
    imageWidth: currentProject?.sourceImageDimensions?.width,
    imageHeight: currentProject?.sourceImageDimensions?.height,
    resolution,
    quality,
    duration,
    jobCount: transitionCount,
    tokenType: currentProject?.settings.tokenType || 'spark',
    enabled: transitionCount > 0
  });

  // Duration options
  const durationOptions = useMemo(() => {
    const options = [];
    for (let d = VIDEO_CONFIG.minDuration; d <= VIDEO_CONFIG.maxDuration; d += VIDEO_CONFIG.durationStep) {
      options.push(d);
    }
    return options;
  }, []);

  // Execute the actual generation (called after confirmation)
  const executeStartGeneration = useCallback(() => {
    // Warm up audio on user interaction for iOS compatibility
    warmUpAudio();

    // Capture current settings BEFORE dispatch to avoid race condition
    const settings: TransitionGenerationSettings = {
      resolution,
      quality,
      duration,
      transitionPrompt,
      musicSelection: musicSelection || undefined
    };

    // Save settings to project (including music selection)
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        transitionPrompt,
        videoResolution: resolution,
        transitionDuration: duration,
        transitionQuality: quality,
        musicSelection: musicSelection || undefined
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

    // Pass settings directly to avoid async state timing issues
    onStartGeneration(newSegments, settings);
  }, [readyWaypoints, transitionPrompt, resolution, duration, quality, musicSelection, dispatch, onStartGeneration]);

  // Handle start generation button click - confirms if work would be lost
  const handleStartGeneration = useCallback(() => {
    if (readyWaypoints.length < 2) {
      showToast({ message: 'Need at least 2 ready angles to create transitions', type: 'warning' });
      return;
    }

    // Use confirmation callback if provided, otherwise execute directly
    if (onConfirmDestructiveAction) {
      onConfirmDestructiveAction('render-videos', executeStartGeneration);
    } else {
      executeStartGeneration();
    }
  }, [readyWaypoints.length, onConfirmDestructiveAction, executeStartGeneration, showToast]);

  return (
    <div className="transition-config-panel">
      {/* Header */}
      <div className="config-header">
        <div className="config-header-left">
          <div className="config-icon">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="config-title-group">
            <h2 className="config-title">Orbital Transition Videos</h2>
            <p className="config-subtitle">
              Create {transitionCount} video{transitionCount !== 1 ? 's' : ''} connecting your {readyWaypoints.length} camera angles into a seamless 360° loop.
            </p>
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
            Video Generation Prompt
          </label>
          <p className="config-hint">
            Describe how the camera should move between angles. The AI will animate the transition.
          </p>
          <textarea
            className="config-textarea"
            value={transitionPrompt}
            onChange={(e) => setTransitionPrompt(e.target.value)}
            placeholder="Describe the transition style..."
            rows={3}
          />
        </div>

        {/* Settings row */}
        <div className="config-settings-row">
          <div className="config-setting">
            <label className="config-setting-label">Resolution</label>
            <select
              className="config-select"
              value={resolution}
              onChange={(e) => setResolution(e.target.value as VideoResolution)}
            >
              {Object.entries(VIDEO_RESOLUTIONS).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>

          <div className="config-setting">
            <label className="config-setting-label">Duration</label>
            <select
              className="config-select"
              value={duration}
              onChange={(e) => setDuration(parseFloat(e.target.value))}
            >
              {durationOptions.map((d) => (
                <option key={d} value={d}>{d}s per clip</option>
              ))}
            </select>
          </div>

          <div className="config-setting">
            <label className="config-setting-label">Quality</label>
            <select
              className="config-select"
              value={quality}
              onChange={(e) => setQuality(e.target.value as VideoQualityPreset)}
            >
              {Object.entries(VIDEO_QUALITY_PRESETS).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Music Section */}
        <MusicConfigSection
          musicSelection={musicSelection}
          onAddMusic={() => setShowMusicSelector(true)}
          onChangeMusic={() => setShowMusicSelector(true)}
          onRemoveMusic={() => setMusicSelection(null)}
        />

        {/* Cost estimate */}
        <div className="config-cost">
          <div className="config-cost-left">
            <span className="config-cost-videos">{transitionCount} videos × {duration}s each</span>
          </div>
          <div className="config-cost-right">
            {costLoading ? (
              <span className="config-cost-loading">Calculating...</span>
            ) : (
              <>
                <span className="config-cost-spark">{formattedCost} Spark</span>
                <span className="config-cost-usd">≈ {formattedUSD}</span>
              </>
            )}
          </div>
        </div>

        {/* Generate Button */}
        <button
          className="generate-btn"
          onClick={handleStartGeneration}
          disabled={readyWaypoints.length < 2}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Generate {transitionCount} Transition Video{transitionCount !== 1 ? 's' : ''}
        </button>
      </div>

      {/* Music Selector Modal */}
      <MusicSelector
        visible={showMusicSelector}
        onConfirm={(selection) => {
          setMusicSelection(selection);
          setShowMusicSelector(false);
        }}
        onClose={() => setShowMusicSelector(false)}
        videoDuration={totalSeconds}
      />
    </div>
  );
};

export default TransitionConfigPanel;
