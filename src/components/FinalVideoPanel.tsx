import React, { useCallback, useRef, useEffect, useState } from 'react';
import MusicSelector from './shared/MusicSelector';
import { useFinalVideoActions } from '../hooks/useFinalVideoActions';
import WorkflowWizard, { WorkflowStep } from './shared/WorkflowWizard';
import type { MusicSelection } from '../types';

interface FinalVideoPanelProps {
  projectId: string;
  videoUrls: string[];
  stitchedVideoUrl?: string;
  onClose: () => void;
  onBackToEditor: () => void;
  onStitchComplete?: (url: string, blob?: Blob) => void;
  initialMusicSelection?: MusicSelection | null;
  onWorkflowStepClick?: (step: WorkflowStep) => void;
}

const FinalVideoPanel: React.FC<FinalVideoPanelProps> = ({
  projectId,
  videoUrls,
  stitchedVideoUrl,
  onClose,
  onBackToEditor,
  onStitchComplete,
  initialMusicSelection,
  onWorkflowStepClick
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showMusicSelector, setShowMusicSelector] = useState(false);

  const {
    isDownloading,
    isStitching,
    stitchProgress,
    localStitchedUrl,
    currentSegmentIndex,
    musicSelection,
    videoDuration,
    setVideoDuration,
    handleMusicConfirm,
    handleRemoveMusic,
    handleTimeUpdate,
    handleDownload,
    handleShare,
    setCurrentSegmentIndex
  } = useFinalVideoActions({ projectId, videoUrls, stitchedVideoUrl, onStitchComplete, initialMusicSelection });

  // Auto-play when stitched video is ready
  useEffect(() => {
    if (localStitchedUrl && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [localStitchedUrl]);

  // Handle video metadata to get duration
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
    }
  }, [setVideoDuration]);

  // Handle time update from video element
  const onTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    handleTimeUpdate(videoRef.current.currentTime, videoRef.current.duration);
  }, [handleTimeUpdate]);

  // Loop video when it ends
  const handleVideoEnded = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
      setCurrentSegmentIndex(0);
    }
  }, [setCurrentSegmentIndex]);

  // Handle music confirm and close modal
  const onMusicConfirm = useCallback(async (selection: Parameters<typeof handleMusicConfirm>[0]) => {
    setShowMusicSelector(false);
    await handleMusicConfirm(selection);
  }, [handleMusicConfirm]);

  // All steps completed up to export
  const completedSteps: WorkflowStep[] = ['upload', 'define-angles', 'render-angles', 'render-videos'];

  return (
    <div className="final-video-panel">
      {/* Workflow Progress */}
      <div className="review-wizard-wrap">
        <WorkflowWizard
          currentStep="export"
          completedSteps={completedSteps}
          onStepClick={onWorkflowStepClick}
        />
      </div>

      {/* Video container */}
      <div className="final-video-container">
        {isStitching ? (
          <div className="flex flex-col items-center justify-center h-full text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mb-4" />
            <p className="text-lg">{stitchProgress || 'Stitching videos...'}</p>
          </div>
        ) : localStitchedUrl ? (
          <video
            ref={videoRef}
            src={localStitchedUrl}
            autoPlay
            muted={!musicSelection}
            playsInline
            loop
            className="final-video"
            onTimeUpdate={onTimeUpdate}
            onEnded={handleVideoEnded}
            onLoadedMetadata={handleLoadedMetadata}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-white">
            <p>No video available</p>
          </div>
        )}

        {/* Segment indicator */}
        {videoUrls.length > 1 && localStitchedUrl && !isStitching && (
          <div className="final-video-indicator">
            {videoUrls.map((_, idx) => (
              <div
                key={idx}
                className={`indicator-dot ${idx === currentSegmentIndex ? 'active' : ''}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Music indicator */}
      {musicSelection && !isStitching && (
        <MusicIndicator
          title={musicSelection.title}
          onRemove={handleRemoveMusic}
        />
      )}

      {/* Action buttons */}
      <div className="final-video-actions">
        <ActionButton
          icon="music"
          onClick={() => setShowMusicSelector(true)}
          disabled={isStitching || !localStitchedUrl}
          title={musicSelection ? 'Change music' : 'Add music'}
          active={!!musicSelection}
        />
        <ActionButton
          icon="download"
          onClick={handleDownload}
          disabled={isDownloading || isStitching || !localStitchedUrl}
          title="Download stitched video"
        />
        <ActionButton
          icon="share"
          onClick={handleShare}
          disabled={isStitching || !localStitchedUrl}
          title="Share video"
        />
        <ActionButton
          icon="back"
          onClick={onBackToEditor}
          title="Back to Editor"
        />
      </div>

      {/* Close button */}
      <button className="final-video-close" onClick={onClose}>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Music Selector Modal */}
      <MusicSelector
        visible={showMusicSelector}
        onConfirm={onMusicConfirm}
        onClose={() => setShowMusicSelector(false)}
        onRemove={handleRemoveMusic}
        currentSelection={musicSelection}
        videoDuration={videoDuration}
      />
    </div>
  );
};

// Sub-components for cleaner JSX

interface MusicIndicatorProps {
  title?: string;
  onRemove: () => void;
}

const MusicIndicator: React.FC<MusicIndicatorProps> = ({ title, onRemove }) => (
  <div
    style={{
      position: 'absolute',
      top: '1rem',
      left: '1rem',
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      borderRadius: '12px',
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      color: 'white',
      fontSize: '13px',
      zIndex: 10
    }}
  >
    <span>🎵</span>
    <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {title}
    </span>
    <button
      onClick={onRemove}
      style={{
        background: 'rgba(255, 255, 255, 0.2)',
        border: 'none',
        borderRadius: '50%',
        width: '20px',
        height: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        cursor: 'pointer',
        fontSize: '12px'
      }}
      title="Remove music"
    >
      ×
    </button>
  </div>
);

interface ActionButtonProps {
  icon: 'music' | 'download' | 'share' | 'back';
  onClick: () => void;
  disabled?: boolean;
  title: string;
  active?: boolean;
}

const ICON_PATHS = {
  music: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  share: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',
  back: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
};

const ActionButton: React.FC<ActionButtonProps> = ({ icon, onClick, disabled, title, active }) => (
  <button
    className={`action-btn ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`}
    onClick={onClick}
    disabled={disabled}
    title={title}
    style={active ? {
      background: 'rgba(236, 72, 153, 0.3)',
      borderColor: 'rgba(236, 72, 153, 0.6)'
    } : undefined}
  >
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_PATHS[icon]} />
    </svg>
  </button>
);

export default FinalVideoPanel;
