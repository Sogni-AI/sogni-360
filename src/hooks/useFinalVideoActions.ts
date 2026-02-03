import { useCallback, useRef, useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { concatenateVideos } from '../utils/video-concatenation';
import { loadAudioAsBuffer } from '../utils/audioUtils';
import { ensureM4AFormat, needsTranscoding } from '../utils/audioTranscoder';
import { trackDownload, trackShare, trackVideoExport } from '../utils/analytics';
import { saveStitchedVideo, loadStitchedVideo, getMusicFingerprint } from '../utils/videoCache';
import type { MusicSelection } from '../types';

interface UseFinalVideoActionsProps {
  projectId: string;
  videoUrls: string[];
  stitchedVideoUrl?: string;
  onStitchComplete?: (url: string, blob?: Blob) => void;
  initialMusicSelection?: MusicSelection | null;
  onMusicChange?: (selection: MusicSelection | null) => void;
}

export function useFinalVideoActions({
  projectId,
  videoUrls,
  stitchedVideoUrl,
  onStitchComplete,
  initialMusicSelection,
  onMusicChange
}: UseFinalVideoActionsProps) {
  const { showToast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isStitching, setIsStitching] = useState(false);
  const [stitchProgress, setStitchProgress] = useState('');
  const [localStitchedUrl, setLocalStitchedUrl] = useState<string | null>(stitchedVideoUrl || null);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [musicSelection, setMusicSelection] = useState<MusicSelection | null>(initialMusicSelection || null);
  const [videoDuration, setVideoDuration] = useState(0);
  const segmentDuration = useRef<number>(0);

  // Guard refs to prevent double-stitching
  const isStitchingRef = useRef(false);
  const hasInitializedRef = useRef(false);

  // Keep callback ref up to date to avoid stale closures in async operations
  const onStitchCompleteRef = useRef(onStitchComplete);
  onStitchCompleteRef.current = onStitchComplete;

  // Stitch videos function
  const stitchVideos = useCallback(async (withMusic: MusicSelection | null = null) => {
    if (videoUrls.length === 0) return;

    // Guard against concurrent stitching
    if (isStitchingRef.current) {
      console.log('[useFinalVideoActions] Already stitching, skipping...');
      return;
    }

    isStitchingRef.current = true;
    setIsStitching(true);
    setStitchProgress('Preparing videos...');

    try {
      const videos = videoUrls.map((url, i) => ({
        url,
        filename: `clip-${i + 1}.mp4`
      }));

      // Prepare audio options if music is selected
      let audioOptions = null;
      if (withMusic) {
        setStitchProgress('Loading audio...');

        // For uploads, validate that file is actually a File/Blob (not a serialized object from IndexedDB)
        const hasValidFile = withMusic.type === 'upload' &&
          withMusic.file instanceof Blob;

        const audioUrl = hasValidFile
          ? URL.createObjectURL(withMusic.file as Blob)
          : withMusic.presetUrl;

        if (audioUrl) {
          let buffer = await loadAudioAsBuffer(audioUrl);

          // Transcode MP3/WAV to M4A for MP4 muxing compatibility
          if (needsTranscoding(buffer)) {
            setStitchProgress('Transcoding audio...');
            const filename = withMusic.file?.name || 'audio.mp3';
            buffer = await ensureM4AFormat(buffer, filename);
          }

          audioOptions = {
            buffer,
            startOffset: withMusic.startOffset
          };

          // Revoke blob URL if we created one from a valid file
          if (hasValidFile) {
            URL.revokeObjectURL(audioUrl);
          }
        }
      }

      const blob = await concatenateVideos(
        videos,
        (_current: number, _total: number, message: string) => {
          setStitchProgress(message);
        },
        audioOptions
      );

      const url = URL.createObjectURL(blob);
      setLocalStitchedUrl(url);

      // Cache the stitched video with music fingerprint for validation
      if (projectId) {
        const musicFingerprint = getMusicFingerprint(withMusic);
        saveStitchedVideo(projectId, blob, videoUrls, musicFingerprint).catch(err => {
          console.warn('[useFinalVideoActions] Failed to cache video:', err);
        });
      }

      // Use ref to ensure we call the latest callback
      onStitchCompleteRef.current?.(url, blob);
    } catch (error) {
      console.error('Stitch error:', error);
      showToast({ message: 'Failed to stitch videos', type: 'error' });
    } finally {
      isStitchingRef.current = false;
      setIsStitching(false);
      setStitchProgress('');
    }
  }, [videoUrls, showToast, projectId]);

  // Load cached video or stitch on mount
  useEffect(() => {
    if (videoUrls.length === 0) return;
    if (hasInitializedRef.current) return;

    hasInitializedRef.current = true;

    const initializeVideo = async () => {
      // If we already have a valid URL, we're done
      if (localStitchedUrl && !localStitchedUrl.startsWith('blob:')) {
        return;
      }

      // Validate that upload files are still valid (File objects don't survive IndexedDB serialization)
      let effectiveMusicSelection = initialMusicSelection;
      if (initialMusicSelection?.type === 'upload' && !(initialMusicSelection.file instanceof Blob)) {
        console.log('[useFinalVideoActions] Music upload file is no longer valid (not a Blob), will stitch without music');
        effectiveMusicSelection = null;
      }

      // Calculate music fingerprint for cache lookup
      const musicFingerprint = getMusicFingerprint(effectiveMusicSelection);

      // Try to load from cache first (validates video URLs AND music selection match)
      if (projectId) {
        try {
          const cachedBlob = await loadStitchedVideo(projectId, videoUrls, musicFingerprint);
          if (cachedBlob) {
            console.log('[useFinalVideoActions] Loaded video from cache');
            const url = URL.createObjectURL(cachedBlob);
            setLocalStitchedUrl(url);
            // Use ref to ensure we call the latest callback
            onStitchCompleteRef.current?.(url, cachedBlob);
            return;
          }
        } catch (err) {
          console.warn('[useFinalVideoActions] Failed to load cached video:', err);
        }
      }

      // No cached video matching current settings, stitch now
      console.log('[useFinalVideoActions] Cache miss, stitching video' + (effectiveMusicSelection ? ' with music' : ''));
      stitchVideos(effectiveMusicSelection);
    };

    initializeVideo();
    // Only run on mount - dependencies are intentionally limited
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, videoUrls.length]);

  // Handle music selection confirmation
  const handleMusicConfirm = useCallback(async (selection: MusicSelection) => {
    setMusicSelection(selection);

    // Notify parent to persist music selection to project settings
    onMusicChange?.(selection);

    // Re-stitch with music
    if (localStitchedUrl && localStitchedUrl.startsWith('blob:')) {
      URL.revokeObjectURL(localStitchedUrl);
      setLocalStitchedUrl(null);
    }
    await stitchVideos(selection);
  }, [localStitchedUrl, stitchVideos, onMusicChange]);

  // Handle removing music
  const handleRemoveMusic = useCallback(async () => {
    setMusicSelection(null);

    // Notify parent to persist music removal to project settings
    onMusicChange?.(null);

    // Re-stitch without music
    if (localStitchedUrl && localStitchedUrl.startsWith('blob:')) {
      URL.revokeObjectURL(localStitchedUrl);
      setLocalStitchedUrl(null);
    }
    await stitchVideos(null);
  }, [localStitchedUrl, stitchVideos, onMusicChange]);

  // Track current segment based on video time
  const handleTimeUpdate = useCallback((currentTime: number, duration: number) => {
    if (videoUrls.length <= 1) return;

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

  // Check if on mobile device
  const isMobile = useCallback(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }, []);

  // Try native share sheet (better UX on mobile)
  const tryNativeShare = useCallback(async (blob: Blob, filename: string): Promise<boolean> => {
    if (!navigator.share || !navigator.canShare) {
      return false;
    }

    try {
      const file = new File([blob], filename, { type: 'video/mp4' });

      if (!navigator.canShare({ files: [file] })) {
        return false;
      }

      await navigator.share({
        files: [file],
        title: 'My Sogni 360 Creation',
        text: 'Check out this 360° orbital portrait I created!'
      });

      return true;
    } catch (error) {
      // AbortError means user cancelled - that's not a failure
      if ((error as Error).name === 'AbortError') {
        return true;
      }
      console.warn('Native share failed:', error);
      return false;
    }
  }, []);

  // Download the stitched video
  const handleDownload = useCallback(async () => {
    if (isDownloading || !localStitchedUrl) return;
    setIsDownloading(true);

    try {
      const response = await fetch(localStitchedUrl);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const filename = `sogni-360-loop-${Date.now()}.mp4`;

      // On mobile, use native share sheet (better UX - save to photos, share, etc.)
      if (isMobile()) {
        const shared = await tryNativeShare(blob, filename);
        if (shared) {
          trackDownload(1, 'video', 'mp4');
          trackVideoExport('mp4', videoDuration);
          return;
        }
        // Fall through to traditional download if share not supported
      }

      // Traditional download approach (desktop or share fallback)
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      trackDownload(1, 'video', 'mp4');
      trackVideoExport('mp4', videoDuration);
    } catch (error) {
      console.error('Download error:', error);
      showToast({ message: 'Download failed', type: 'error' });
    } finally {
      setIsDownloading(false);
    }
  }, [localStitchedUrl, showToast, isDownloading, isMobile, tryNativeShare, videoDuration]);

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
          trackShare('native', 'video');
          return;
        }
      }

      // Fallback: copy URL to clipboard
      await navigator.clipboard.writeText(localStitchedUrl);
      trackShare('clipboard', 'video');
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

  return {
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
  };
}
