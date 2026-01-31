import React, { useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Waypoint } from '../../types';
import ImageAdjuster from '../shared/ImageAdjuster';

interface UploadAngleModeProps {
  insertAfterIndex: number;
  sourceImageDimensions: { width: number; height: number };
  onInsertAngle: (waypoint: Waypoint) => void;
}

const UploadAngleMode: React.FC<UploadAngleModeProps> = ({
  sourceImageDimensions,
  onInsertAngle
}) => {
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [showAdjuster, setShowAdjuster] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      return;
    }
    const url = URL.createObjectURL(file);
    setUploadedImageUrl(url);
    setShowAdjuster(true);
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleAdjusterConfirm = (blob: Blob) => {
    const imageUrl = URL.createObjectURL(blob);
    const waypoint: Waypoint = {
      id: uuidv4(),
      azimuth: 'front',
      elevation: 'eye-level',
      distance: 'medium',
      status: 'ready',
      imageUrl,
      isOriginal: true
    };
    onInsertAngle(waypoint);
  };

  const handleAdjusterCancel = () => {
    if (uploadedImageUrl) {
      URL.revokeObjectURL(uploadedImageUrl);
    }
    setUploadedImageUrl(null);
    setShowAdjuster(false);
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="upload-angle-mode">
      <p className="upload-angle-mode-desc">
        Upload an image to be used as-is as one of your frames. Your angle frames will transition smoothly into this frame.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      <div
        className={`upload-angle-dropzone ${isDragOver ? 'dragover' : ''}`}
        onClick={openFilePicker}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="upload-angle-dropzone-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        <div className="upload-angle-dropzone-text">
          <span className="upload-angle-dropzone-primary">Click to upload</span>
          <span className="upload-angle-dropzone-secondary">or drag and drop</span>
        </div>
      </div>

      {showAdjuster && uploadedImageUrl && (
        <ImageAdjuster
          imageUrl={uploadedImageUrl}
          targetDimensions={sourceImageDimensions}
          onConfirm={handleAdjusterConfirm}
          onCancel={handleAdjusterCancel}
        />
      )}
    </div>
  );
};

export default UploadAngleMode;
