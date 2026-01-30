import React from 'react';
import { MUSIC_PRESETS, S2V_TRACKS, WINTER_TRACKS, HALLOWEEN_TRACKS, type MusicTrack } from '../../../constants/musicPresets';

interface PresetMusicListProps {
  selectedPresetId: string | null;
  onSelectPreset: (track: MusicTrack) => void;
  isLoading: boolean;
}

const PresetMusicList: React.FC<PresetMusicListProps> = ({
  selectedPresetId,
  onSelectPreset,
  isLoading
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const trackId = e.target.value;
    if (!trackId) return;

    const track = MUSIC_PRESETS.find(t => t.id === trackId);
    if (track) {
      onSelectPreset(track);
    }
  };

  // Format track display with emoji if present
  const formatTrackLabel = (track: MusicTrack) => {
    const emoji = track.emoji ? `${track.emoji} ` : '';
    return `${emoji}${track.title} (${track.duration})`;
  };

  return (
    <div className="preset-music-list">
      <select
        value={selectedPresetId || ''}
        onChange={handleChange}
        disabled={isLoading}
        style={{
          width: '100%',
          padding: '12px 16px',
          fontSize: '14px',
          fontWeight: 500,
          borderRadius: '12px',
          border: '2px solid rgba(255, 255, 255, 0.2)',
          background: 'rgba(255, 255, 255, 0.1)',
          color: 'white',
          cursor: isLoading ? 'wait' : 'pointer',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='white' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          paddingRight: '36px'
        }}
      >
        <option value="" disabled style={{ color: '#666' }}>
          Select a track...
        </option>

        {/* S2V Samples - grouped */}
        <optgroup label="🎤 Sound Clips" style={{ color: '#000' }}>
          {S2V_TRACKS.map(track => (
            <option key={track.id} value={track.id} style={{ color: '#000' }}>
              {formatTrackLabel(track)}
            </option>
          ))}
        </optgroup>

        {/* Winter Tracks */}
        <optgroup label="❄️ Winter" style={{ color: '#000' }}>
          {WINTER_TRACKS.map(track => (
            <option key={track.id} value={track.id} style={{ color: '#000' }}>
              {formatTrackLabel(track)}
            </option>
          ))}
        </optgroup>

        {/* Halloween Tracks */}
        <optgroup label="🎃 Halloween" style={{ color: '#000' }}>
          {HALLOWEEN_TRACKS.map(track => (
            <option key={track.id} value={track.id} style={{ color: '#000' }}>
              {formatTrackLabel(track)}
            </option>
          ))}
        </optgroup>
      </select>

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
