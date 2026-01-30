import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getProjectCount } from '../utils/localProjectsDB';

const SourceUploader: React.FC = () => {
  const { setSourceImage, dispatch } = useApp();
  const { showToast } = useToast();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [projectCount, setProjectCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for existing projects
  useEffect(() => {
    getProjectCount().then(setProjectCount).catch(() => setProjectCount(0));
  }, []);

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

  const handleOpenProjects = useCallback(() => {
    dispatch({ type: 'SET_SHOW_PROJECT_MANAGER', payload: true });
  }, [dispatch]);

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

      {projectCount > 0 && (
        <button
          className="uploader-load-projects-btn"
          onClick={handleOpenProjects}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Load Existing Project ({projectCount})
        </button>
      )}
    </div>
  );
};

export default SourceUploader;
