import React from 'react';
import type { MusicSelection } from '../../types';
import { formatAudioTime } from '../../utils/audioUtils';

interface MusicConfigSectionProps {
  musicSelection: MusicSelection | null;
  onAddMusic: () => void;
  onChangeMusic: () => void;
  onRemoveMusic: () => void;
}

const MusicConfigSection: React.FC<MusicConfigSectionProps> = ({
  musicSelection,
  onAddMusic,
  onChangeMusic,
  onRemoveMusic
}) => {
  return (
    <div className="config-section">
      <label className="config-label">
        Background Music
        <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.5)', marginLeft: '8px' }}>(Optional)</span>
      </label>
      {musicSelection ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            background: 'rgba(236, 72, 153, 0.15)',
            border: '1px solid rgba(236, 72, 153, 0.4)',
            borderRadius: '12px'
          }}
        >
          <span style={{ fontSize: '24px' }}>🎵</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'white' }}>
              {musicSelection.title}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              {formatAudioTime(musicSelection.startOffset)} - {formatAudioTime(musicSelection.startOffset + musicSelection.duration)}
              <span style={{ marginLeft: '8px' }}>({formatAudioTime(musicSelection.duration)} selected)</span>
            </div>
          </div>
          <button
            onClick={onChangeMusic}
            style={{
              padding: '6px 12px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: 'white',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Change
          </button>
          <button
            onClick={onRemoveMusic}
            style={{
              padding: '6px 10px',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '16px',
              cursor: 'pointer'
            }}
            title="Remove music"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          onClick={onAddMusic}
          className="music-add-btn"
          style={{
            width: '100%',
            padding: '14px 20px',
            background: 'rgba(255,255,255,0.05)',
            border: '2px dashed rgba(255,255,255,0.2)',
            borderRadius: '12px',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          Add Music Track
        </button>
      )}
    </div>
  );
};

export default MusicConfigSection;
