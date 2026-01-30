import React, { useRef } from 'react';
import { validateAudioFile } from '../../../utils/audioUtils';

interface AudioUploaderProps {
  uploadedFile: File | null;
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  error: string | null;
  onError: (error: string | null) => void;
}

const AudioUploader: React.FC<AudioUploaderProps> = ({
  uploadedFile,
  onFileSelect,
  isLoading,
  error,
  onError
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again
    e.target.value = '';

    // Validate file
    const validationError = validateAudioFile(file);
    if (validationError) {
      onError(validationError);
      return;
    }

    onError(null);
    onFileSelect(file);
  };

  return (
    <div className="audio-uploader">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/wav,audio/wave,.mp3,.m4a,.wav"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <button
        onClick={handleClick}
        disabled={isLoading}
        style={{
          width: '100%',
          padding: '16px 20px',
          fontSize: '14px',
          fontWeight: 600,
          borderRadius: '12px',
          border: uploadedFile
            ? '2px solid rgba(34, 197, 94, 0.6)'
            : '2px dashed rgba(255, 255, 255, 0.3)',
          background: uploadedFile
            ? 'rgba(34, 197, 94, 0.15)'
            : 'rgba(255, 255, 255, 0.05)',
          color: 'white',
          cursor: isLoading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'all 0.2s ease'
        }}
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            Loading...
          </>
        ) : uploadedFile ? (
          <>
            <span style={{ color: 'rgba(34, 197, 94, 1)' }}>✓</span>
            {uploadedFile.name.length > 30
              ? uploadedFile.name.slice(0, 27) + '...'
              : uploadedFile.name}
          </>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload MP3, M4A, or WAV
          </>
        )}
      </button>

      {error && (
        <p style={{
          marginTop: '8px',
          fontSize: '12px',
          color: '#f87171',
          textAlign: 'center'
        }}>
          {error}
        </p>
      )}

      <p style={{
        marginTop: '8px',
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center'
      }}>
        Maximum file size: 50MB
      </p>
    </div>
  );
};

export default AudioUploader;
