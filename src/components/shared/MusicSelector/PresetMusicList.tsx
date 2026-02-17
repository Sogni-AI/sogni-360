import React, { useState, useRef, useCallback } from 'react';
import { S2V_TRACKS, type MusicTrack } from '../../../constants/musicPresets';

interface PresetMusicListProps {
  selectedPresetId: string | null;
  onSelectPreset: (track: MusicTrack) => void;
  isLoading: boolean;
}

const ACCENT = 'rgba(168, 85, 247, 1)';

const PresetMusicList: React.FC<PresetMusicListProps> = ({
  selectedPresetId,
  onSelectPreset,
  isLoading
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [previewingTrackId, setPreviewingTrackId] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setPreviewingTrackId(null);
    setIsPreviewPlaying(false);
  }, []);

  const handlePreviewToggle = useCallback((track: MusicTrack) => {
    const audio = previewAudioRef.current;
    if (!audio) return;

    if (previewingTrackId === track.id) {
      if (isPreviewPlaying) {
        audio.pause();
        setIsPreviewPlaying(false);
      } else {
        audio.play().catch(() => setIsPreviewPlaying(false));
        setIsPreviewPlaying(true);
      }
    } else {
      audio.pause();
      audio.src = track.url;
      audio.load();
      audio.play().catch(() => setIsPreviewPlaying(false));
      setPreviewingTrackId(track.id);
      setIsPreviewPlaying(true);
    }
  }, [previewingTrackId, isPreviewPlaying]);

  const handleRowClick = useCallback((track: MusicTrack) => {
    stopPreview();
    setShowBrowser(false);
    setSearchQuery('');
    onSelectPreset(track);
  }, [stopPreview, onSelectPreset]);

  const selectedTrack = selectedPresetId
    ? S2V_TRACKS.find(t => t.id === selectedPresetId)
    : null;

  const filteredTracks = S2V_TRACKS.filter(track =>
    track.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="preset-music-list">
      {/* Hidden audio element for track preview */}
      <audio
        ref={previewAudioRef}
        onEnded={() => { setPreviewingTrackId(null); setIsPreviewPlaying(false); }}
        onError={() => { setPreviewingTrackId(null); setIsPreviewPlaying(false); }}
        style={{ display: 'none' }}
      />

      {/* Toggle button — shows selected track or "Browse Tracks" */}
      <button
        onClick={() => {
          if (showBrowser) {
            stopPreview();
          }
          setShowBrowser(!showBrowser);
          setSearchQuery('');
        }}
        disabled={isLoading}
        style={{
          width: '100%',
          padding: '12px 16px',
          fontSize: '14px',
          fontWeight: 500,
          borderRadius: showBrowser ? '12px 12px 0 0' : '12px',
          border: selectedTrack
            ? `2px solid ${ACCENT}`
            : '2px solid rgba(255, 255, 255, 0.2)',
          background: selectedTrack
            ? 'rgba(168, 85, 247, 0.15)'
            : 'rgba(255, 255, 255, 0.1)',
          color: 'white',
          cursor: isLoading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left' as const
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
          {selectedTrack
            ? `${selectedTrack.emoji || '🎵'} ${selectedTrack.title}`
            : '🎵 Browse sample tracks...'}
        </span>
        <span style={{
          fontSize: '10px',
          transition: 'transform 0.2s ease',
          transform: showBrowser ? 'rotate(180deg)' : 'rotate(0deg)',
          flexShrink: 0,
          marginLeft: '8px'
        }}>{'\u25BC'}</span>
      </button>

      {/* Expandable track browser */}
      {showBrowser && (
        <div style={{
          border: '2px solid rgba(255, 255, 255, 0.2)',
          borderTop: 'none',
          borderBottomLeftRadius: '12px',
          borderBottomRightRadius: '12px',
          background: 'rgba(0, 0, 0, 0.2)',
          overflow: 'hidden'
        }}>
          {/* Search input */}
          <div style={{ padding: '8px 8px 4px' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tracks..."
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '8px 32px 8px 10px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: 'white',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box' as const
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    lineHeight: 1
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Scrollable track list */}
          <div style={{
            maxHeight: '260px',
            overflowY: 'auto',
            overscrollBehavior: 'contain'
          }}>
            {filteredTracks.map((track) => {
              const isSelected = selectedPresetId === track.id;
              const isPreviewing = previewingTrackId === track.id;
              return (
                <div
                  key={track.id}
                  onClick={() => handleRowClick(track)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    minHeight: '48px',
                    cursor: isLoading ? 'wait' : 'pointer',
                    background: isSelected ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                    borderLeft: isSelected ? `3px solid ${ACCENT}` : '3px solid transparent',
                    transition: 'background 0.15s ease',
                    boxSizing: 'border-box' as const
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255, 255, 255, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  }}
                >
                  {/* Play/Pause button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreviewToggle(track);
                    }}
                    disabled={isLoading}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      border: 'none',
                      background: isPreviewing && isPreviewPlaying
                        ? ACCENT
                        : 'rgba(255, 255, 255, 0.15)',
                      color: 'white',
                      fontSize: '13px',
                      cursor: isLoading ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'background 0.15s ease',
                      padding: 0
                    }}
                  >
                    {isPreviewing && isPreviewPlaying ? '\u23F8' : '\u25B6'}
                  </button>

                  {/* Emoji */}
                  {track.emoji && (
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{track.emoji}</span>
                  )}

                  {/* Title */}
                  <span style={{
                    flex: 1,
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: isSelected ? 600 : 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' as const
                  }}>
                    {track.title}
                  </span>

                  {/* Duration */}
                  <span style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '12px',
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums' as const
                  }}>
                    {track.duration}
                  </span>
                </div>
              );
            })}
            {filteredTracks.length === 0 && (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '13px'
              }}>
                No tracks match &ldquo;{searchQuery}&rdquo;
              </div>
            )}
          </div>
        </div>
      )}

      {isLoading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginTop: '12px',
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '13px'
        }}>
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
          Loading audio...
        </div>
      )}
    </div>
  );
};

export default PresetMusicList;
