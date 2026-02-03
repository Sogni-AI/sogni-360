import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getProjectCount } from '../utils/localProjectsDB';
import { resizeImageIfNeeded } from '../utils/imageUtils';
import DemoVideoBackground from './DemoVideoBackground';

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
      const originalDimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = dataUrl;
      });

      // Resize if longest dimension exceeds 2048px
      const { dataUrl: finalDataUrl, dimensions } = await resizeImageIfNeeded(dataUrl, originalDimensions);

      setSourceImage(finalDataUrl, dimensions);
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
    <div className="relative w-full h-full overflow-hidden">
      {/* Demo video mosaic background */}
      <DemoVideoBackground />

      {/* Main content */}
      <div className="source-uploader-content">
        <div className="uploader-frame">
          <div className="text-center mb-8">
            <h1 className="uploader-title">Sogni 360</h1>
            <p className="uploader-subtitle">Create immersive 360° orbital videos</p>
          </div>

          <div className="upload-area-wrapper">
            <div
              className={`upload-area ${isDragOver ? 'dragover' : ''}`}
              onClick={handleClick}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {/* Floating particles */}
              <div className="upload-particles">
                <div className="upload-particle" />
                <div className="upload-particle" />
                <div className="upload-particle" />
                <div className="upload-particle" />
                <div className="upload-particle" />
              </div>

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
                  {/* Upload icon with rotating orbital rings */}
                  <div className="upload-orbital-icon">
                    <div className="orbital-ring" />
                    <div className="upload-icon-circle">
                      <svg viewBox="0 0 24 24">
                        <path d="M12 16V4M12 4L8 8M12 4L16 8" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                  <p className="upload-text">
                    Drop an image or tap to upload
                  </p>
                  <p className="upload-text-secondary">
                    PNG, JPG up to 20MB
                  </p>
                </>
              )}
            </div>
          </div>

          <button
            className={`uploader-load-projects-btn ${projectCount === 0 ? 'demo-variant' : ''}`}
            onClick={handleOpenProjects}
          >
            {projectCount > 0 ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                Load Existing Project ({projectCount})
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="demo-icon">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="demo-text">Load a Demo Project</span>
              </>
            )}
          </button>

          {/* Powered by badge */}
          <div className="uploader-badge">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Powered by Sogni Supernet
          </div>
        </div>
      </div>
    </div>
  );
};

export default SourceUploader;
