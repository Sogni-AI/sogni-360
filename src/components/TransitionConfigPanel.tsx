import React from 'react';
import type { Segment } from '../types';
import {
  VIDEO_QUALITY_PRESETS,
  VIDEO_RESOLUTIONS,
  VideoResolution,
  VideoQualityPreset,
} from '../constants/videoSettings';
import type { WorkflowStep } from './shared/WorkflowWizard';
import MusicSelector from './shared/MusicSelector';
import MusicConfigSection from './shared/MusicConfigSection';
import AdvancedSettingsPopup from './shared/AdvancedSettingsPopup';
import LiquidGlassPanel from './shared/LiquidGlassPanel';
import TransitionPromptSection from './TransitionPromptSection';
import {
  useTransitionConfig,
  TransitionGenerationSettings,
} from '../hooks/useTransitionConfig';
import { usePanelResize } from '../hooks/usePanelResize';
import ResizeGrip from './shared/ResizeGrip';

// Re-export for consumers that import from this file
export type { TransitionGenerationSettings };

interface TransitionConfigPanelProps {
  onClose: () => void;
  onStartGeneration: (segments: Segment[], settings: TransitionGenerationSettings) => void;
  onConfirmDestructiveAction?: (actionStep: WorkflowStep, onConfirm: () => void) => void;
  onRequireAuth?: () => void;
}

const TransitionConfigPanel: React.FC<TransitionConfigPanelProps> = ({
  onClose,
  onStartGeneration,
  onConfirmDestructiveAction,
  onRequireAuth
}) => {
  const config = useTransitionConfig({ onStartGeneration, onConfirmDestructiveAction, onRequireAuth });
  const { prompts } = config;

  const resize = usePanelResize();

  return (
    <LiquidGlassPanel
      ref={resize.panelRef}
      cornerRadius={16}
      modalTint
      className={`transition-config-panel glass-modal${resize.panelSize ? ' resized' : ''}${resize.isDragging ? ' resizing' : ''}`}
      displacementScale={60}
      saturation={160}
      aberrationIntensity={4}
      style={resize.resizeStyle}
    >
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
            <h2 className="config-title">
              Configure Transition Videos
              <button
                className="title-settings-btn"
                onClick={() => config.setShowSettings(true)}
                title="Project Settings"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </h2>
            <p className="config-subtitle">
              {config.modelChangedWarning
                ? `Video model changed — all ${config.transitionCount} transition${config.transitionCount !== 1 ? 's' : ''} will be regenerated.`
                : config.allReady
                  ? `All ${config.transitionCount} transition video${config.transitionCount !== 1 ? 's are' : ' is'} ready.`
                  : config.pendingCount < config.transitionCount && config.pendingCount > 0
                    ? `${config.pendingCount} of ${config.transitionCount} transition video${config.transitionCount !== 1 ? 's need' : ' needs'} to be generated.`
                    : `Create ${config.transitionCount} video${config.transitionCount !== 1 ? 's' : ''} connecting your ${config.readyWaypoints.length} camera angles into a seamless 360° loop.`
              }
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
        {/* Transition Prompt Section */}
        <TransitionPromptSection
          promptMode={prompts.promptMode}
          onPromptModeChange={prompts.handlePromptModeChange}
          transitionPrompt={prompts.transitionPrompt}
          onTransitionPromptChange={prompts.setTransitionPrompt}
          selectedPresetId={prompts.selectedPresetId}
          onPresetChange={prompts.handlePresetChange}
          segments={config.reconciledSegments}
          perSegmentPrompts={prompts.perSegmentPrompts}
          onSegmentPromptChange={prompts.setSegmentPrompt}
          getWaypointLabel={prompts.getWaypointLabel}
          getWaypointImage={prompts.getWaypointImage}
          isExpandingAI={prompts.isExpandingAI}
          expandingSegmentId={prompts.expandingSegmentId}
          onExpandAllWithAI={prompts.handleExpandAllWithAI}
          onExpandSegmentWithAI={prompts.handleExpandSegmentWithAI}
          showAIButton={prompts.showAIButton}
        />

        {/* Settings row */}
        <div className="config-settings-row">
          <div className="config-setting">
            <label className="config-setting-label">Resolution</label>
            <select
              className="config-select"
              value={config.resolution}
              onChange={(e) => config.setResolution(e.target.value as VideoResolution)}
            >
              {config.validResolutions.map((key) => (
                <option key={key} value={key}>{VIDEO_RESOLUTIONS[key].label}</option>
              ))}
            </select>
          </div>

          <div className="config-setting">
            <label className="config-setting-label">Duration</label>
            <select
              className="config-select"
              value={config.duration}
              onChange={(e) => config.setDuration(parseFloat(e.target.value))}
            >
              {config.durationOptions.map((d) => (
                <option key={d} value={d}>{d}s per clip</option>
              ))}
            </select>
          </div>

          {/* Quality dropdown — only for WAN 2.2, LTX-2.3 uses fixed default steps */}
          {!config.isLtx && (
            <div className="config-setting">
              <label className="config-setting-label">Quality</label>
              <select
                className="config-select"
                value={config.wanQuality}
                onChange={(e) => config.setWanQuality(e.target.value as VideoQualityPreset)}
              >
                {Object.entries(VIDEO_QUALITY_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>{preset.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Music Section */}
        <MusicConfigSection
          musicSelection={config.musicSelection}
          onAddMusic={() => config.setShowMusicSelector(true)}
          onChangeMusic={() => config.setShowMusicSelector(true)}
          onRemoveMusic={() => config.setMusicSelection(null)}
        />

        {/* Cost estimate */}
        {config.allReady ? (
          <div className="config-cost">
            <div className="config-cost-left">
              <span className="config-cost-videos">Regenerate all: {config.transitionCount} video{config.transitionCount !== 1 ? 's' : ''} × {config.duration}s each</span>
            </div>
            <div className="config-cost-right">
              {config.regenCostLoading ? (
                <span className="config-cost-loading">Calculating...</span>
              ) : (
                <>
                  <span className="config-cost-spark">{config.regenFormattedCost} {config.tokenType.toUpperCase()}</span>
                  <span className="config-cost-usd">≈ {config.regenFormattedUSD}</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="config-cost">
            <div className="config-cost-left">
              <span className="config-cost-videos">
                {config.pendingCount} video{config.pendingCount !== 1 ? 's' : ''} × {config.duration}s each
              </span>
            </div>
            <div className="config-cost-right">
              {config.costLoading ? (
                <span className="config-cost-loading">Calculating...</span>
              ) : (
                <>
                  <span className="config-cost-spark">{config.formattedCost} {config.tokenType.toUpperCase()}</span>
                  <span className="config-cost-usd">≈ {config.formattedUSD}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Generate / View Buttons */}
        {config.allReady ? (
          <div className="config-action-buttons">
            <button
              className="generate-btn generate-btn-secondary"
              onClick={config.handleRegenerateAll}
              disabled={config.readyWaypoints.length < 2}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate All
            </button>
            <button
              className="generate-btn"
              onClick={onClose}
              disabled={config.readyWaypoints.length < 2}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              View Transition Videos
            </button>
          </div>
        ) : (
          <button
            className="generate-btn"
            onClick={config.handleStartGeneration}
            disabled={config.readyWaypoints.length < 2}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Generate {config.pendingCount} Transition Video{config.pendingCount !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Music Selector Modal */}
      <MusicSelector
        visible={config.showMusicSelector}
        onConfirm={(selection) => {
          config.setMusicSelection(selection);
          config.setShowMusicSelector(false);
        }}
        onClose={() => config.setShowMusicSelector(false)}
        onRemove={() => config.setMusicSelection(null)}
        currentSelection={config.musicSelection}
        videoDuration={config.totalSeconds}
      />

      {/* Settings Popup */}
      <AdvancedSettingsPopup
        isOpen={config.showSettings}
        onClose={() => config.setShowSettings(false)}
      />

      <ResizeGrip
        onPointerDown={resize.handleResizePointerDown}
        onPointerMove={resize.handleResizePointerMove}
        onPointerUp={resize.handleResizePointerUp}
      />
    </LiquidGlassPanel>
  );
};

export default TransitionConfigPanel;
