import React, { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getProjectCount } from '../utils/localProjectsDB';
import { resizeImageIfNeeded, normalizeImageToTargetDimensions } from '../utils/imageUtils';
import { AZIMUTHS } from '../constants/cameraAngleSettings';
import type { Waypoint, AzimuthKey } from '../types';
import DemoVideoBackground from './DemoVideoBackground';
import LiquidGlassPanel from './shared/LiquidGlassPanel';

/** Distribute N azimuths evenly around the 8 available positions. */
function distributeAzimuths(count: number): AzimuthKey[] {
  if (count <= 0) return [];
  if (count >= AZIMUTHS.length) return AZIMUTHS.map(a => a.key);
  const step = AZIMUTHS.length / count;
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.round(i * step) % AZIMUTHS.length;
    return AZIMUTHS[idx].key;
  });
}

/** Read a File as a data URL. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Get the natural dimensions of an image from its data URL. */
function getImageDims(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

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

  const processImages = useCallback(async (files: File[]) => {
    // Validate all files upfront
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      showToast({ message: 'Please upload image files', type: 'error' });
      return;
    }
    const oversized = imageFiles.find(f => f.size > 20 * 1024 * 1024);
    if (oversized) {
      showToast({ message: 'Each image must be less than 20MB', type: 'error' });
      return;
    }

    setIsLoading(true);

    try {
      // Process first image — becomes the source image
      const firstDataUrl = await readFileAsDataUrl(imageFiles[0]);
      const firstDims = await getImageDims(firstDataUrl);
      const { dataUrl: sourceDataUrl, dimensions: sourceDims } = await resizeImageIfNeeded(firstDataUrl, firstDims);

      setSourceImage(sourceDataUrl, sourceDims);

      // Single image: existing flow — no waypoints, preset auto-loads in WaypointEditor
      if (imageFiles.length === 1) return;

      // Multiple images: create waypoints for all files
      const azimuths = distributeAzimuths(imageFiles.length);
      const waypoints: Waypoint[] = [];

      // First image becomes the first waypoint (already processed)
      waypoints.push({
        id: uuidv4(),
        azimuth: azimuths[0],
        elevation: 'eye-level',
        distance: 'close-up',
        status: 'ready',
        imageUrl: sourceDataUrl,
        isOriginal: true,
      });

      // Process remaining images — normalize to match source dimensions
      for (let i = 1; i < imageFiles.length; i++) {
        try {
          const dataUrl = await readFileAsDataUrl(imageFiles[i]);
          const dims = await getImageDims(dataUrl);
          const { dataUrl: resizedUrl } = await resizeImageIfNeeded(dataUrl, dims);

          // Normalize to source dimensions if different
          let finalUrl = resizedUrl;
          const resizedDims = await getImageDims(resizedUrl);
          if (resizedDims.width !== sourceDims.width || resizedDims.height !== sourceDims.height) {
            finalUrl = await normalizeImageToTargetDimensions(resizedUrl, sourceDims);
          }

          waypoints.push({
            id: uuidv4(),
            azimuth: azimuths[i],
            elevation: 'eye-level',
            distance: 'close-up',
            status: 'ready',
            imageUrl: finalUrl,
            isOriginal: true,
          });
        } catch (err) {
          console.error(`Failed to process image ${i + 1}:`, err);
        }
      }

      if (waypoints.length > 1) {
        dispatch({ type: 'SET_WAYPOINTS', payload: waypoints });
      }
    } catch (error) {
      console.error('Error processing images:', error);
      showToast({ message: 'Failed to process images', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [setSourceImage, showToast, dispatch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processImages(files);
    }
  }, [processImages]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processImages(Array.from(files));
    }
    // Reset input so the same files can be selected again
    e.target.value = '';
  }, [processImages]);

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

          <LiquidGlassPanel cornerRadius={16} subtle className="glass-brighten">
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
                multiple
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
                    Drop images or tap to upload
                  </p>
                  <p className="upload-text-secondary">
                    PNG, JPG up to 20MB — multiple images supported
                  </p>
                </>
              )}
            </div>
          </LiquidGlassPanel>

          {/* OR separator */}
          <div className="uploader-or-separator">
            <span className="uploader-or-line" />
            <span className="uploader-or-text">or</span>
            <span className="uploader-or-line" />
          </div>

          <LiquidGlassPanel cornerRadius={24} subtle className="glass-brighten" style={{ marginTop: '0.875rem' }}>
            <button
              className={`uploader-load-projects-btn ${projectCount === 0 ? 'demo-variant' : 'existing-variant'}`}
              onClick={handleOpenProjects}
            >
              {projectCount > 0 ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="existing-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="existing-text">Load Existing Project ({projectCount})</span>
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
          </LiquidGlassPanel>

          {/* Powered by badge */}
          <a
            href="https://www.sogni.ai/supernet"
            target="_blank"
            rel="noopener noreferrer"
            className="uploader-badge"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Powered by Sogni Supernet
          </a>
        </div>
      </div>
    </div>
  );
};

export default SourceUploader;
