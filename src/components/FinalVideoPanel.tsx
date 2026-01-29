import React, { useCallback, useRef, useEffect } from 'react';
import { useToast } from '../context/ToastContext';

interface FinalVideoPanelProps {
  videoUrl: string;
  onClose: () => void;
  onBackToEditor: () => void;
}

const FinalVideoPanel: React.FC<FinalVideoPanelProps> = ({
  videoUrl,
  onClose,
  onBackToEditor
}) => {
  const { showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Auto-play on mount
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay may be blocked, that's fine
      });
    }
  }, [videoUrl]);

  // Download video
  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = `sogni-360-${Date.now()}.mp4`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast({ message: 'Video downloaded!', type: 'success' });
    } catch (error) {
      console.error('Download error:', error);
      showToast({ message: 'Download failed', type: 'error' });
    }
  }, [videoUrl, showToast]);

  // Share video
  const handleShare = useCallback(async () => {
    try {
      // Check if Web Share API is available
      if (navigator.share && navigator.canShare) {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        const file = new File([blob], 'sogni-360.mp4', { type: 'video/mp4' });

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
      await navigator.clipboard.writeText(videoUrl);
      showToast({ message: 'Video URL copied to clipboard!', type: 'success' });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // User cancelled share, that's fine
        return;
      }
      console.error('Share error:', error);
      showToast({ message: 'Share failed', type: 'error' });
    }
  }, [videoUrl, showToast]);

  return (
    <div className="final-video-panel">
      {/* Video container */}
      <div className="final-video-container">
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          loop
          muted
          playsInline
          className="final-video"
        />
      </div>

      {/* Action buttons */}
      <div className="final-video-actions">
        <button
          className="action-btn"
          onClick={handleDownload}
          title="Download"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>

        <button
          className="action-btn"
          onClick={handleShare}
          title="Share"
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
