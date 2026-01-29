import React, { useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';

const SourceUploader: React.FC = () => {
  const { setSourceImage } = useApp();
  const { showToast } = useToast();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast({ message: 'Please upload an image file', type: 'error' });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      showToast({ message: 'Image must be less than 20MB', type: 'error' });
      return;
    }

    setIsLoading(true);

    try {
      // Read file as data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Get image dimensions
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = dataUrl;
      });

      setSourceImage(dataUrl, dimensions);
    } catch (error) {
      console.error('Error processing image:', error);
      showToast({ message: 'Failed to process image', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [setSourceImage, showToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      processImage(file);
    }
  }, [processImage]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
  }, [processImage]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Sogni 360</h1>
        <p className="text-gray-400 text-lg">Create immersive 360° orbital portraits</p>
      </div>

      <div
        className={`upload-area ${isDragOver ? 'dragover' : ''}`}
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white">Processing...</p>
          </div>
        ) : (
          <>
            <div className="text-5xl mb-4">📷</div>
            <p className="text-white text-lg">
              Drop an image or tap to upload
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default SourceUploader;
