import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { concatenateVideos } from '../utils/video-concatenation';

interface FinalVideoPanelProps {
  videoUrls: string[];
  stitchedVideoUrl?: string;
  onClose: () => void;
  onBackToEditor: () => void;
  onStitchComplete?: (url: string) => void;
}

const FinalVideoPanel: React.FC<FinalVideoPanelProps> = ({
  videoUrls,
  stitchedVideoUrl,
  onClose,
  onBackToEditor,
  onStitchComplete
}) => {
  const { showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isStitching, setIsStitching] = useState(false);
  const [stitchProgress, setStitchProgress] = useState('');
  const [localStitchedUrl, setLocalStitchedUrl] = useState<string | null>(stitchedVideoUrl || null);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const segmentDuration = useRef<number>(0);

  // Calculate segment duration assuming equal length segments
  useEffect(() => {
    if (videoUrls.length > 0) {
      // Will be updated when video metadata loads
      segmentDuration.current = 0;
    }
  }, [videoUrls.length]);

  // Stitch videos on mount if no stitched URL provided
  useEffect(() => {
    if (localStitchedUrl || videoUrls.length === 0) return;

    const stitchVideos = async () => {
      setIsStitching(true);
      setStitchProgress('Preparing videos...');

      try {
        const videos = videoUrls.map((url, i) => ({
          url,
          filename: `clip-${i + 1}.mp4`
        }));

        const blob = await concatenateVideos(
          videos,
          (_current: number, _total: number, message: string) => {
            setStitchProgress(message);
          }
        );

        const url = URL.createObjectURL(blob);
        setLocalStitchedUrl(url);
        onStitchComplete?.(url);
        showToast({ message: 'Video stitched successfully!', type: 'success' });
      } catch (error) {
        console.error('Stitch error:', error);
        showToast({ message: 'Failed to stitch videos', type: 'error' });
      } finally {
        setIsStitching(false);
        setStitchProgress('');
      }
    };

    stitchVideos();
  }, [videoUrls, localStitchedUrl, showToast, onStitchComplete]);

  // Auto-play when stitched video is ready
  useEffect(() => {
    if (localStitchedUrl && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay may be blocked
      });
    }
  }, [localStitchedUrl]);

  // Track current segment based on video time
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || videoUrls.length <= 1) return;

    const currentTime = videoRef.current.currentTime;
    const duration = videoRef.current.duration;

    if (duration > 0 && segmentDuration.current === 0) {
      segmentDuration.current = duration / videoUrls.length;
    }

    if (segmentDuration.current > 0) {
      const newIndex = Math.min(
        Math.floor(currentTime / segmentDuration.current),
        videoUrls.length - 1
      );
      if (newIndex !== currentSegmentIndex) {
        setCurrentSegmentIndex(newIndex);
      }
    }
  }, [videoUrls.length, currentSegmentIndex]);

  // Loop video when it ends
  const handleVideoEnded = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
      setCurrentSegmentIndex(0);
    }
  }, []);

  // Download the stitched video
  const handleDownload = useCallback(async () => {
    if (isDownloading || !localStitchedUrl) return;
    setIsDownloading(true);

    try {
      showToast({ message: 'Preparing download...', type: 'info' });

      const response = await fetch(localStitchedUrl);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const filename = `sogni-360-loop-${Date.now()}.mp4`;

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      showToast({ message: 'Download complete!', type: 'success' });
    } catch (error) {
      console.error('Download error:', error);
      showToast({ message: 'Download failed', type: 'error' });
    } finally {
      setIsDownloading(false);
    }
  }, [localStitchedUrl, showToast, isDownloading]);

  // Share video
  const handleShare = useCallback(async () => {
    if (!localStitchedUrl) return;

    try {
      if (navigator.share && navigator.canShare) {
        const response = await fetch(localStitchedUrl);
        const blob = await response.blob();
        const file = new File([blob], 'sogni-360-loop.mp4', { type: 'video/mp4' });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'My Sogni 360 Creation',
            text: 'Check out this 360° orbital portrait I created!'
          });
          return;
        }
      }

      // Fallback: copy URL to clipboard
      await navigator.clipboard.writeText(localStitchedUrl);
      showToast({ message: 'Video URL copied to clipboard!', type: 'success' });
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Share error:', error);
      showToast({ message: 'Share failed', type: 'error' });
    }
  }, [localStitchedUrl, showToast]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (localStitchedUrl && localStitchedUrl.startsWith('blob:') && !stitchedVideoUrl) {
        URL.revokeObjectURL(localStitchedUrl);
      }
    };
  }, [localStitchedUrl, stitchedVideoUrl]);

  return (
    <div className="final-video-panel">
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
            muted
            playsInline
            loop
            className="final-video"
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleVideoEnded}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-white">
            <p>No video available</p>
          </div>
        )}

        {/* Segment indicator - synced to stitched video playback */}
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

      {/* Action buttons */}
      <div className="final-video-actions">
        <button
          className={`action-btn ${isDownloading || isStitching || !localStitchedUrl ? 'disabled' : ''}`}
          onClick={handleDownload}
          disabled={isDownloading || isStitching || !localStitchedUrl}
          title="Download stitched video"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>

        <button
          className={`action-btn ${isStitching || !localStitchedUrl ? 'disabled' : ''}`}
          onClick={handleShare}
          disabled={isStitching || !localStitchedUrl}
          title="Share video"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>

        <button
          className="action-btn"
          onClick={onBackToEditor}
          title="Back to Editor"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Close button */}
      <button
        className="final-video-close"
        onClick={onClose}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export default FinalVideoPanel;
