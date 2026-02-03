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
  onMusicChange?: (selection: MusicSelection | null) => void;
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
  onMusicChange,
  onWorkflowStepClick
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showMusicSelector, setShowMusicSelector] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsPlayPrompt, setNeedsPlayPrompt] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const INACTIVITY_TIMEOUT = 3000; // 3 seconds

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
  } = useFinalVideoActions({ projectId, videoUrls, stitchedVideoUrl, onStitchComplete, initialMusicSelection, onMusicChange });

  // Reset inactivity timer on user interaction
  const resetInactivityTimer = useCallback(() => {
    setUiVisible(true);
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    // Only start hiding timer if video is playing
    if (isPlaying) {
      inactivityTimerRef.current = setTimeout(() => {
        setUiVisible(false);
      }, INACTIVITY_TIMEOUT);
    }
  }, [isPlaying]);

  // Handle user interaction to show UI
  const handleUserInteraction = useCallback(() => {
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  // Start/stop inactivity timer based on play state
  useEffect(() => {
    if (isPlaying) {
      // Start inactivity timer when video starts playing
      inactivityTimerRef.current = setTimeout(() => {
        setUiVisible(false);
      }, INACTIVITY_TIMEOUT);
    } else {
      // Show UI and clear timer when video is paused
      setUiVisible(true);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    }

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [isPlaying]);

  // Request fullscreen on mobile (tap video area)
  const requestFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Use the video element's webkitEnterFullscreen for iOS Safari
    // or standard requestFullscreen for other browsers
    if ('webkitEnterFullscreen' in video && typeof (video as unknown as { webkitEnterFullscreen: () => void }).webkitEnterFullscreen === 'function') {
      (video as unknown as { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
    } else if (video.requestFullscreen) {
      video.requestFullscreen();
    } else if ('webkitRequestFullscreen' in video && typeof (video as unknown as { webkitRequestFullscreen: () => void }).webkitRequestFullscreen === 'function') {
      (video as unknown as { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
    }
  }, []);

  // Handle tap on video container (mobile fullscreen)
  const handleVideoContainerClick = useCallback((e: React.MouseEvent) => {
    // Only handle clicks directly on the video container, not on buttons/controls
    if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'VIDEO') {
      // Check if mobile (touch device)
      const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (isMobile && isPlaying) {
        requestFullscreen();
      } else {
        // On desktop, show UI on click
        handleUserInteraction();
      }
    }
  }, [isPlaying, requestFullscreen, handleUserInteraction]);

  // Auto-play when stitched video is ready
  // iOS blocks autoplay for videos with audio, so we handle the failure gracefully
  useEffect(() => {
    if (localStitchedUrl && videoRef.current) {
      const video = videoRef.current;

      video.play()
        .then(() => {
          setIsPlaying(true);
          setNeedsPlayPrompt(false);
        })
        .catch((err) => {
          // Autoplay was blocked (common on iOS with audio)
          console.log('[FinalVideoPanel] Autoplay blocked:', err.name);
          setIsPlaying(false);
          setNeedsPlayPrompt(true);
        });
    }
  }, [localStitchedUrl]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play()
        .then(() => {
          setIsPlaying(true);
          setNeedsPlayPrompt(false);
        })
        .catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

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
      videoRef.current.play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          setIsPlaying(false);
        });
      setCurrentSegmentIndex(0);
    }
  }, [setCurrentSegmentIndex]);

  // Handle music confirm and close modal
  const onMusicConfirm = useCallback(async (selection: Parameters<typeof handleMusicConfirm>[0]) => {
    setShowMusicSelector(false);
    await handleMusicConfirm(selection);
  }, [handleMusicConfirm]);

  // Compute completed steps dynamically based on stitching state
  const completedSteps: WorkflowStep[] = ['upload', 'define-angles', 'render-angles', 'render-videos'];
  // Add 'export' to completed steps when stitching is done
  if (localStitchedUrl && !isStitching) {
    completedSteps.push('export');
  }

  return (
    <div
      className="final-video-panel"
      ref={containerRef}
      onMouseMove={handleUserInteraction}
      onTouchStart={handleUserInteraction}
    >
      {/* Workflow Progress */}
      <div className={`review-wizard-wrap final-video-ui-element ${uiVisible ? 'visible' : 'hidden'}`}>
        <WorkflowWizard
          currentStep="export"
          completedSteps={completedSteps}
          onStepClick={onWorkflowStepClick}
        />
      </div>

      {/* Video container */}
      <div className="final-video-container" onClick={handleVideoContainerClick}>
        {isStitching ? (
          <div className="flex flex-col items-center justify-center h-full text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mb-4" />
            <p className="text-lg">{stitchProgress || 'Stitching videos...'}</p>
          </div>
        ) : localStitchedUrl ? (
          <>
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
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            {/* Play prompt overlay for iOS when autoplay is blocked */}
            {needsPlayPrompt && (
              <button
                className="play-prompt-overlay"
                onClick={togglePlayPause}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: 'none',
                  cursor: 'pointer',
                  zIndex: 5
                }}
              >
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.95)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="rgba(168, 85, 247, 1)"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <p
                  style={{
                    marginTop: '16px',
                    color: 'white',
                    fontSize: '16px',
                    fontWeight: 600,
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)'
                  }}
                >
                  Tap to Play
                </p>
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-white">
            <p>No video available</p>
          </div>
        )}

        {/* Segment indicator */}
        {videoUrls.length > 1 && localStitchedUrl && !isStitching && (() => {
          const segmentCount = videoUrls.length;
          const maxWidth = 240;

          // For many segments, use tiny dots
          let baseDotSize: number;
          let baseGap: number;
          if (segmentCount <= 10) {
            baseDotSize = 6;
            baseGap = 6;
          } else if (segmentCount <= 20) {
            baseDotSize = 4;
            baseGap = 4;
          } else {
            baseDotSize = 3;
            baseGap = 3;
          }

          const spaceNeeded = segmentCount * baseDotSize + (segmentCount - 1) * baseGap;
          const scale = spaceNeeded > maxWidth ? maxWidth / spaceNeeded : 1;
          const dotSize = Math.max(2, Math.round(baseDotSize * scale));
          const gap = Math.max(1, Math.round(baseGap * scale));
          const activeDotWidth = Math.min(dotSize * 2, dotSize + 4);

          return (
            <div
              className={`final-video-ui-element ${uiVisible ? 'visible' : 'hidden'}`}
              style={{
                position: 'absolute',
                bottom: '1rem',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: `${gap}px`,
                padding: `6px ${Math.max(8, gap * 2)}px`,
                background: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(8px)',
                borderRadius: '9999px',
                maxWidth: `${maxWidth}px`,
              }}
            >
              {videoUrls.map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    width: idx === currentSegmentIndex ? `${activeDotWidth}px` : `${dotSize}px`,
                    height: `${dotSize}px`,
                    borderRadius: '50%',
                    background: idx === currentSegmentIndex ? 'white' : 'rgba(255, 255, 255, 0.4)',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          );
        })()}
      </div>

      {/* Action buttons */}
      <div className={`final-video-actions final-video-ui-element ${uiVisible ? 'visible' : 'hidden'}`}>
        <ActionButton
          icon={isPlaying ? 'pause' : 'play'}
          onClick={togglePlayPause}
          disabled={isStitching || !localStitchedUrl}
          title={isPlaying ? 'Pause' : 'Play'}
        />
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
      <button className={`final-video-close final-video-ui-element ${uiVisible ? 'visible' : 'hidden'}`} onClick={onClose}>
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

interface ActionButtonProps {
  icon: 'play' | 'pause' | 'music' | 'download' | 'share' | 'back';
  onClick: () => void;
  disabled?: boolean;
  title: string;
  active?: boolean;
}

const ICON_PATHS = {
  play: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  pause: 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z',
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
