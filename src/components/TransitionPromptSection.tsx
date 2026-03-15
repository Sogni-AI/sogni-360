/**
 * TransitionPromptSection — Prompt mode toggle, preset dropdown, textarea(s),
 * per-segment thumbnail rows, and AI expansion controls for the transition config panel.
 */

import React from 'react';
import type { Segment } from '../types';
import { TRANSITION_PROMPT_PRESETS } from '../constants/transitionPromptPresets';
import type { PromptMode } from '../hooks/useTransitionPrompts';

interface TransitionPromptSectionProps {
  promptMode: PromptMode;
  onPromptModeChange: (mode: PromptMode) => void;
  transitionPrompt: string;
  onTransitionPromptChange: (prompt: string) => void;
  selectedPresetId: string;
  onPresetChange: (presetId: string) => void;
  segments: Segment[];
  perSegmentPrompts: Record<string, string>;
  onSegmentPromptChange: (segmentId: string, prompt: string) => void;
  getWaypointLabel: (id: string) => string;
  getWaypointImage: (id: string) => string | undefined;
  isExpandingAI: boolean;
  expandingSegmentId: string | null;
  onExpandAllWithAI: () => void;
  onExpandSegmentWithAI: (segmentId: string) => void;
  showAIButton: boolean;
}

const AIExpandButton: React.FC<{
  onClick: () => void;
  isExpanding: boolean;
  disabled?: boolean;
}> = ({ onClick, isExpanding, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={isExpanding || disabled}
    className="prompt-expand-ai-btn"
  >
    {isExpanding ? (
      <>
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" />
        </svg>
        Expanding...
      </>
    ) : (
      <>
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        Expand with AI
      </>
    )}
  </button>
);

const SegmentPromptRow: React.FC<{
  segment: Segment;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  getWaypointLabel: (id: string) => string;
  getWaypointImage: (id: string) => string | undefined;
  isExpanding: boolean;
  onExpandWithAI: () => void;
  showAIButton: boolean;
}> = ({ segment, prompt, onPromptChange, getWaypointLabel, getWaypointImage, isExpanding, onExpandWithAI, showAIButton }) => {
  const fromImg = getWaypointImage(segment.fromWaypointId);
  const toImg = getWaypointImage(segment.toWaypointId);
  const fromLabel = getWaypointLabel(segment.fromWaypointId);
  const toLabel = getWaypointLabel(segment.toWaypointId);

  return (
    <div className="segment-prompt-row">
      <div className="segment-prompt-thumbs">
        <div className="segment-thumb">
          {fromImg && <img src={fromImg} alt={fromLabel} />}
          <span className="segment-thumb-label" title={fromLabel}>{fromLabel}</span>
        </div>
        <svg className="segment-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="segment-thumb">
          {toImg && <img src={toImg} alt={toLabel} />}
          <span className="segment-thumb-label" title={toLabel}>{toLabel}</span>
        </div>
      </div>
      <div className="segment-prompt-input">
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Describe this transition..."
          rows={2}
          readOnly={isExpanding}
          className={`config-textarea segment-textarea${isExpanding ? ' opacity-60' : ''}`}
        />
        {showAIButton && (
          <AIExpandButton onClick={onExpandWithAI} isExpanding={isExpanding} />
        )}
      </div>
    </div>
  );
};

const TransitionPromptSection: React.FC<TransitionPromptSectionProps> = ({
  promptMode,
  onPromptModeChange,
  transitionPrompt,
  onTransitionPromptChange,
  selectedPresetId,
  onPresetChange,
  segments,
  perSegmentPrompts,
  onSegmentPromptChange,
  getWaypointLabel,
  getWaypointImage,
  isExpandingAI,
  expandingSegmentId,
  onExpandAllWithAI,
  onExpandSegmentWithAI,
  showAIButton,
}) => (
  <div className="config-section">
    <label className="config-label">Video Transition Prompt</label>
    <p className="config-hint">
      Select a preset or customize how the camera should move between angles.
    </p>

    {/* Mode toggle */}
    <div className="prompt-mode-toggle">
      <button
        className={`prompt-mode-btn${promptMode === 'all' ? ' active' : ''}`}
        onClick={() => onPromptModeChange('all')}
      >
        Same Prompt for All
      </button>
      <button
        className={`prompt-mode-btn${promptMode === 'each' ? ' active' : ''}`}
        onClick={() => onPromptModeChange('each')}
      >
        Unique Prompt for Each
      </button>
    </div>

    {promptMode === 'all' ? (
      <>
        {/* Preset dropdown */}
        <select
          className="config-select config-preset-select"
          value={selectedPresetId}
          onChange={(e) => onPresetChange(e.target.value)}
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

        {/* Shared prompt textarea */}
        <textarea
          className={`config-textarea${isExpandingAI ? ' opacity-60' : ''}`}
          value={transitionPrompt}
          onChange={(e) => onTransitionPromptChange(e.target.value)}
          placeholder="Describe the transition style..."
          rows={3}
          readOnly={isExpandingAI}
        />
        {showAIButton && (
          <div className="prompt-ai-row">
            <AIExpandButton onClick={onExpandAllWithAI} isExpanding={isExpandingAI} />
            <span className="prompt-ai-hint">
              AI will analyze the image pair and generate a unique scene transition intelligently based on the relationships it finds between them.
            </span>
          </div>
        )}
      </>
    ) : (
      <>
        {/* Per-segment prompt list */}
        <div className="segment-prompt-list">
          {segments.map((seg) => (
            <SegmentPromptRow
              key={seg.id}
              segment={seg}
              prompt={perSegmentPrompts[seg.id] ?? transitionPrompt}
              onPromptChange={(p) => onSegmentPromptChange(seg.id, p)}
              getWaypointLabel={getWaypointLabel}
              getWaypointImage={getWaypointImage}
              isExpanding={expandingSegmentId === seg.id}
              onExpandWithAI={() => onExpandSegmentWithAI(seg.id)}
              showAIButton={showAIButton}
            />
          ))}
        </div>
        {showAIButton && (
          <p className="prompt-ai-hint" style={{ marginTop: '0.5rem' }}>
            AI will analyze each image pair and generate a unique scene transition intelligently based on the relationships it finds between them.
          </p>
        )}
      </>
    )}
  </div>
);

export default TransitionPromptSection;
