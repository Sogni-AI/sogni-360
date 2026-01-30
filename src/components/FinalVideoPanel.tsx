import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';

interface FinalVideoPanelProps {
  videoUrls: string[];
  onClose: () => void;
  onBackToEditor: () => void;
}

const FinalVideoPanel: React.FC<FinalVideoPanelProps> = ({
  videoUrls,
  onClose,
  onBackToEditor
}) => {
  const { showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  // Current video URL
  const currentVideoUrl = videoUrls[currentIndex] || videoUrls[0];

  // Auto-play on mount and when video changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay may be blocked, that's fine
      });
    }
  }, [currentVideoUrl]);

  // Advance to next video when current one ends
  const handleVideoEnded = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % videoUrls.length);
  }, [videoUrls.length]);

  // Download ALL videos as individual files
  const handleDownload = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);

    try {
      showToast({ message: `Downloading ${videoUrls.length} clips...`, type: 'info' });

      for (let i = 0; i < videoUrls.length; i++) {
        const url = videoUrls[i];
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Download failed for clip ${i + 1}`);

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const filename = `sogni-360-clip-${i + 1}-${Date.now()}.mp4`;

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);

        // Small delay between downloads to not overwhelm the browser
        if (i < videoUrls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      showToast({ message: `Downloaded ${videoUrls.length} clips!`, type: 'success' });
    } catch (error) {
      console.error('Download error:', error);
      showToast({ message: 'Download failed', type: 'error' });
    } finally {
      setIsDownloading(false);
    }
  }, [videoUrls, showToast, isDownloading]);

  // Share - for now shares current clip (Web Share API limitation)
  const handleShare = useCallback(async () => {
    try {
      // Check if Web Share API is available
      if (navigator.share && navigator.canShare) {
        const response = await fetch(currentVideoUrl);
        const blob = await response.blob();
        const file = new File([blob], `sogni-360-clip-${currentIndex + 1}.mp4`, { type: 'video/mp4' });

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
      await navigator.clipboard.writeText(currentVideoUrl);
      showToast({ message: 'Video URL copied to clipboard!', type: 'success' });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // User cancelled share, that's fine
        return;
      }
      console.error('Share error:', error);
      showToast({ message: 'Share failed', type: 'error' });
    }
  }, [currentVideoUrl, currentIndex, showToast]);

  return (
    <div className="final-video-panel">
      {/* Video container - full resolution, scales down only if needed */}
      <div className="final-video-container">
        <video
          ref={videoRef}
          key={currentVideoUrl}
          src={currentVideoUrl}
          autoPlay
          muted
          playsInline
          className="final-video"
          onEnded={handleVideoEnded}
        />

        {/* Video indicator */}
        {videoUrls.length > 1 && (
          <div className="final-video-indicator">
            {videoUrls.map((_, idx) => (
              <div
                key={idx}
                className={`indicator-dot ${idx === currentIndex ? 'active' : ''}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="final-video-actions">
        <button
          className={`action-btn ${isDownloading ? 'disabled' : ''}`}
          onClick={handleDownload}
          disabled={isDownloading}
          title={`Download all ${videoUrls.length} clips`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>

        <button
          className="action-btn"
          onClick={handleShare}
          title="Share current clip"
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

      {/* Close button (overlay corner) */}
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
