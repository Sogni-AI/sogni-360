import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MusicSelectorProps, AudioSourceType, AudioState } from './types';
import type { MusicTrack } from '../../../constants/musicPresets';
import { generateWaveform, getAudioDuration } from '../../../utils/audioUtils';
import PresetMusicList from './PresetMusicList';
import AudioUploader from './AudioUploader';
import AudioTrimmer from './AudioTrimmer';

const initialAudioState: AudioState = {
  url: null,
  file: null,
  presetId: null,
  title: '',
  duration: 0,
  waveform: [],
  startOffset: 0,
  selectedDuration: 5
};

const MusicSelector: React.FC<MusicSelectorProps> = ({
  visible,
  onConfirm,
  onClose,
  onRemove,
  currentSelection,
  videoDuration
}) => {
  const [sourceType, setSourceType] = useState<AudioSourceType>('presets');
  const [audioState, setAudioState] = useState<AudioState>(initialAudioState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blobUrlRef = useRef<string | null>(null);

  // Cleanup blob URL on unmount or when audio changes
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setAudioState(initialAudioState);
      setError(null);
      setIsLoading(false);
    }
  }, [visible]);

  // Load audio from URL and generate waveform
  const loadAudio = useCallback(async (url: string, title: string, presetId: string | null = null, file: File | null = null) => {
    setIsLoading(true);
    setError(null);

    try {
      const [waveform, duration] = await Promise.all([
        generateWaveform(url),
        getAudioDuration(url)
      ]);

      // Set selected duration to video duration or audio duration, whichever is smaller
      const defaultDuration = Math.min(duration, videoDuration || duration);

      setAudioState({
        url,
        file,
        presetId,
        title,
        duration,
        waveform,
        startOffset: 0,
        selectedDuration: Math.round(defaultDuration * 4) / 4 // Round to 0.25s
      });
    } catch (err) {
      console.error('Failed to load audio:', err);
      setError('Failed to load audio file. Please try another.');
    } finally {
      setIsLoading(false);
    }
  }, [videoDuration]);

  // Handle preset selection
  const handlePresetSelect = useCallback((track: MusicTrack) => {
    // Clear any previous blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    loadAudio(track.url, track.title, track.id);
  }, [loadAudio]);

  // Handle file upload
  const handleFileSelect = useCallback((file: File) => {
    // Clear any previous blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }

    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;

    loadAudio(url, file.name, null, file);
  }, [loadAudio]);

  // Handle trim changes
  const handleStartOffsetChange = useCallback((offset: number) => {
    setAudioState(prev => ({ ...prev, startOffset: offset }));
  }, []);

  const handleSelectedDurationChange = useCallback((duration: number) => {
    setAudioState(prev => ({ ...prev, selectedDuration: duration }));
  }, []);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (!audioState.url) return;

    onConfirm({
      type: audioState.presetId ? 'preset' : 'upload',
      file: audioState.file || undefined,
      presetUrl: audioState.presetId ? audioState.url : undefined,
      presetId: audioState.presetId || undefined,
      title: audioState.title,
      startOffset: audioState.startOffset,
      duration: audioState.selectedDuration,
      totalDuration: audioState.duration,
      waveform: audioState.waveform
    });
  }, [audioState, onConfirm]);

  // Handle tab change
  const handleTabChange = (tab: AudioSourceType) => {
    setSourceType(tab);
    // Don't clear audio state when switching tabs - allow keeping selection
  };

  if (!visible) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
        padding: '20px',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none'
      }}
      onClick={onClose}
      onContextMenu={e => e.preventDefault()}
      onTouchStart={e => e.stopPropagation()}
    >
      <div
        onClick={e => e.stopPropagation()}
        onContextMenu={e => e.preventDefault()}
        onTouchStart={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.9) 0%, rgba(168, 85, 247, 0.9) 100%)',
          borderRadius: '20px',
          padding: '24px',
          maxWidth: '420px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
          WebkitTouchCallout: 'none'
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            fontSize: '18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ×
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <span style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>🎵</span>
          <h3 style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: 700,
            color: 'white'
          }}>
            Add Music
          </h3>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px'
        }}>
          <button
            onClick={() => handleTabChange('presets')}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              background: sourceType === 'presets'
                ? 'rgba(255, 255, 255, 0.95)'
                : 'rgba(255, 255, 255, 0.15)',
              color: sourceType === 'presets' ? 'rgba(168, 85, 247, 1)' : 'white',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Samples
          </button>
          <button
            onClick={() => handleTabChange('upload')}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              background: sourceType === 'upload'
                ? 'rgba(255, 255, 255, 0.95)'
                : 'rgba(255, 255, 255, 0.15)',
              color: sourceType === 'upload' ? 'rgba(168, 85, 247, 1)' : 'white',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Upload
          </button>
        </div>

        {/* Tab content */}
        <div style={{ marginBottom: '20px' }}>
          {sourceType === 'presets' ? (
            <PresetMusicList
              selectedPresetId={audioState.presetId}
              onSelectPreset={handlePresetSelect}
              isLoading={isLoading}
            />
          ) : (
            <AudioUploader
              uploadedFile={audioState.file}
              onFileSelect={handleFileSelect}
              isLoading={isLoading}
              error={error}
              onError={setError}
            />
          )}
        </div>

        {/* Audio trimmer (show when audio is loaded) */}
        {audioState.url && audioState.waveform.length > 0 && (
          <AudioTrimmer
            audioUrl={audioState.url}
            waveform={audioState.waveform}
            audioDuration={audioState.duration}
            videoDuration={videoDuration}
            startOffset={audioState.startOffset}
            selectedDuration={audioState.selectedDuration}
            onStartOffsetChange={handleStartOffsetChange}
            onSelectedDurationChange={handleSelectedDurationChange}
            fixedDuration
          />
        )}

        {/* Remove music button (only show if there's existing music) */}
        {currentSelection && onRemove && (
          <button
            onClick={() => {
              onRemove();
              onClose();
            }}
            style={{
              width: '100%',
              padding: '12px 20px',
              marginTop: '20px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'rgba(255, 255, 255, 0.8)',
              fontWeight: 500,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Remove Current Music
          </button>
        )}

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginTop: currentSelection && onRemove ? '12px' : '20px'
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '14px 20px',
              borderRadius: '12px',
              border: '2px solid rgba(255, 255, 255, 0.5)',
              background: 'transparent',
              color: 'white',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!audioState.url || isLoading}
            style={{
              flex: 1,
              padding: '14px 20px',
              borderRadius: '12px',
              border: 'none',
              background: audioState.url && !isLoading
                ? 'rgba(255, 255, 255, 0.95)'
                : 'rgba(255, 255, 255, 0.3)',
              color: audioState.url && !isLoading
                ? 'rgba(168, 85, 247, 1)'
                : 'rgba(255, 255, 255, 0.5)',
              fontWeight: 700,
              fontSize: '14px',
              cursor: audioState.url && !isLoading ? 'pointer' : 'not-allowed'
            }}
          >
            Use This Track
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MusicSelector;
