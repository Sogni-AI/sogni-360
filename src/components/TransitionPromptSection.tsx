/** TransitionPromptSection — Prompt mode toggle, preset dropdown, carousel editor,
 * and AI expansion controls for the transition config panel. */
import React, { useState, useRef, useCallback, useEffect } from 'react';
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

const SegmentCarouselCard: React.FC<{
  segment: Segment;
  index: number;
  isActive: boolean;
  onClick: () => void;
  getWaypointLabel: (id: string) => string;
  getWaypointImage: (id: string) => string | undefined;
}> = ({ segment, index, isActive, onClick, getWaypointLabel, getWaypointImage }) => {
  const fromImg = getWaypointImage(segment.fromWaypointId);
  const toImg = getWaypointImage(segment.toWaypointId);
  const fromLabel = getWaypointLabel(segment.fromWaypointId);
  const toLabel = getWaypointLabel(segment.toWaypointId);

  return (
    <button
      type="button"
      className={`segment-carousel-card${isActive ? ' active' : ''}`}
      onClick={onClick}
      title={`${fromLabel} → ${toLabel}`}
    >
      <span className="segment-carousel-index">{index + 1}</span>
      <div className="segment-carousel-thumbs">
        {fromImg && <img src={fromImg} alt={fromLabel} className="segment-carousel-img" />}
        <svg className="segment-carousel-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
        {toImg && <img src={toImg} alt={toLabel} className="segment-carousel-img" />}
      </div>
    </button>
  );
};

const SegmentEditor: React.FC<{
  segment: Segment;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  getWaypointLabel: (id: string) => string;
  isExpanding: boolean;
  onExpandWithAI: () => void;
  showAIButton: boolean;
}> = ({ segment, prompt, onPromptChange, getWaypointLabel, isExpanding, onExpandWithAI, showAIButton }) => {
  const fromLabel = getWaypointLabel(segment.fromWaypointId);
  const toLabel = getWaypointLabel(segment.toWaypointId);

  return (
    <div className="segment-editor">
      <div className="segment-editor-header">
        <span className="segment-editor-label">{fromLabel} → {toLabel}</span>
        {showAIButton && (
          <AIExpandButton onClick={onExpandWithAI} isExpanding={isExpanding} />
        )}
      </div>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="Describe this transition..."
        rows={3}
        readOnly={isExpanding}
        className={`config-textarea segment-textarea${isExpanding ? ' opacity-60' : ''}`}
      />
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
}) => {
  const [activeSegmentIdx, setActiveSegmentIdx] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeSegmentIdx >= segments.length && segments.length > 0) {
      setActiveSegmentIdx(segments.length - 1);
    }
  }, [segments.length]);

  const scrollToCard = useCallback((idx: number) => {
    const container = carouselRef.current;
    if (!container) return;
    const card = container.children[idx] as HTMLElement | undefined;
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, []);

  const handleCardClick = useCallback((idx: number) => {
    setActiveSegmentIdx(idx);
    scrollToCard(idx);
  }, [scrollToCard]);

  const handlePrev = useCallback(() => {
    const next = Math.max(0, activeSegmentIdx - 1);
    setActiveSegmentIdx(next);
    scrollToCard(next);
  }, [activeSegmentIdx, scrollToCard]);

  const handleNext = useCallback(() => {
    const next = Math.min(segments.length - 1, activeSegmentIdx + 1);
    setActiveSegmentIdx(next);
    scrollToCard(next);
  }, [activeSegmentIdx, segments.length, scrollToCard]);

  const activeSeg = segments[activeSegmentIdx];

  return (
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
          <div className="segment-carousel-wrapper">
            <button
              type="button"
              className="segment-carousel-nav prev"
              onClick={handlePrev}
              disabled={activeSegmentIdx === 0}
              aria-label="Previous segment"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="segment-carousel-track" ref={carouselRef}>
              {segments.map((seg, idx) => (
                <SegmentCarouselCard
                  key={seg.id}
                  segment={seg}
                  index={idx}
                  isActive={idx === activeSegmentIdx}
                  onClick={() => handleCardClick(idx)}
                  getWaypointLabel={getWaypointLabel}
                  getWaypointImage={getWaypointImage}
                />
              ))}
            </div>

            <button
              type="button"
              className="segment-carousel-nav next"
              onClick={handleNext}
              disabled={activeSegmentIdx === segments.length - 1}
              aria-label="Next segment"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {activeSeg && (
            <SegmentEditor
              segment={activeSeg}
              prompt={perSegmentPrompts[activeSeg.id] ?? transitionPrompt}
              onPromptChange={(p) => onSegmentPromptChange(activeSeg.id, p)}
              getWaypointLabel={getWaypointLabel}
              isExpanding={expandingSegmentId === activeSeg.id}
              onExpandWithAI={() => onExpandSegmentWithAI(activeSeg.id)}
              showAIButton={showAIButton}
            />
          )}

          {showAIButton && (
            <p className="prompt-ai-hint" style={{ marginTop: '0.5rem' }}>
              AI will analyze each image pair and generate a unique scene transition intelligently based on the relationships it finds between them.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default TransitionPromptSection;
