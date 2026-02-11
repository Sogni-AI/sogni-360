import React, { useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Waypoint } from '../../types';
import ImageAdjuster, {
  AdjustmentParams,
  applyAdjustmentToImage
} from '../shared/ImageAdjuster';
import { normalizeImageToTargetDimensions } from '../../utils/imageUtils';

interface UploadAngleModeProps {
  insertAfterIndex: number;
  sourceImageDimensions: { width: number; height: number };
  onInsertAngle: (waypoint: Waypoint) => void;
  onInsertAngles?: (waypoints: Waypoint[]) => void;
}

interface PendingImage {
  file: File;
  url: string;
  dimensions: { width: number; height: number };
}

async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

const UploadAngleMode: React.FC<UploadAngleModeProps> = ({
  sourceImageDimensions,
  onInsertAngle,
  onInsertAngles
}) => {
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [showAdjuster, setShowAdjuster] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelect = useCallback(async (files: File[]) => {
    setError(null);

    // Filter for image files only
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setError('Please select image files');
      return;
    }

    try {
      // Get dimensions for all images
      const imagesWithDimensions: PendingImage[] = [];

      for (const file of imageFiles) {
        const dimensions = await getImageDimensions(file);
        imagesWithDimensions.push({
          file,
          url: URL.createObjectURL(file),
          dimensions
        });
      }

      setPendingImages(imagesWithDimensions);
      setShowAdjuster(true);
    } catch (err) {
      console.error('Error processing images:', err);
      setError('Failed to process images');
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFilesSelect(Array.from(files));
    }
    // Reset input so the same files can be selected again
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFilesSelect(Array.from(files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleAdjusterConfirmWithParams = async (
    firstBlob: Blob,
    params: AdjustmentParams
  ) => {
    if (pendingImages.length === 0) return;

    setIsProcessing(true);
    setProcessingProgress(0);

    try {
      const waypoints: Waypoint[] = [];
      const firstImageDims = pendingImages[0].dimensions;

      // First image is already processed
      const firstImageUrl = URL.createObjectURL(firstBlob);
      waypoints.push({
        id: uuidv4(),
        azimuth: 'front',
        elevation: 'eye-level',
        distance: 'medium',
        status: 'ready',
        imageUrl: firstImageUrl,
        isOriginal: true
      });
      setProcessingProgress(1);

      // Process remaining images with same adjustments
      for (let i = 1; i < pendingImages.length; i++) {
        const img = pendingImages[i];
        try {
          // Check if this image has different dimensions than the first
          const needsNormalization =
            img.dimensions.width !== firstImageDims.width ||
            img.dimensions.height !== firstImageDims.height;

          let imageUrlToProcess = img.url;
          let normalizedUrl: string | null = null;

          // If dimensions differ, normalize to match first image using center+cover
          if (needsNormalization) {
            normalizedUrl = await normalizeImageToTargetDimensions(
              img.url,
              firstImageDims
            );
            imageUrlToProcess = normalizedUrl;
          }

          const processedBlob = await applyAdjustmentToImage(
            imageUrlToProcess,
            sourceImageDimensions,
            params
          );

          // Clean up normalized URL if we created one
          if (normalizedUrl) {
            URL.revokeObjectURL(normalizedUrl);
          }

          const imageUrl = URL.createObjectURL(processedBlob);
          waypoints.push({
            id: uuidv4(),
            azimuth: 'front',
            elevation: 'eye-level',
            distance: 'medium',
            status: 'ready',
            imageUrl,
            isOriginal: true
          });
        } catch (err) {
          console.error(`Failed to process image ${i + 1}:`, err);
          // Continue with other images even if one fails
        }
        setProcessingProgress(i + 1);
      }

      // Clean up original blob URLs
      pendingImages.forEach((img) => URL.revokeObjectURL(img.url));
      setPendingImages([]);
      setShowAdjuster(false);
      setIsProcessing(false);

      // Call appropriate callback
      if (waypoints.length === 1) {
        onInsertAngle(waypoints[0]);
      } else if (waypoints.length > 1 && onInsertAngles) {
        onInsertAngles(waypoints);
      } else {
        // Fallback: insert one at a time
        waypoints.forEach((wp) => onInsertAngle(wp));
      }
    } catch (err) {
      console.error('Error processing images:', err);
      setError('Failed to process images');
      setIsProcessing(false);
    }
  };

  const handleAdjusterCancel = () => {
    // Clean up all blob URLs
    pendingImages.forEach((img) => URL.revokeObjectURL(img.url));
    setPendingImages([]);
    setShowAdjuster(false);
    setError(null);
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="upload-angle-mode">
      <p className="upload-angle-mode-desc">
        Upload one or more images to use as frames. Images with different
        dimensions will be automatically scaled and cropped to match the first
        image. The adjustment you make to the first image will be applied to all.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {error && <div className="upload-angle-error">{error}</div>}

      <div
        className={`upload-angle-dropzone ${isDragOver ? 'dragover' : ''}`}
        onClick={openFilePicker}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="upload-angle-dropzone-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
        </div>
        <div className="upload-angle-dropzone-text">
          <span className="upload-angle-dropzone-primary">Click to upload</span>
          <span className="upload-angle-dropzone-secondary">
            or drag and drop (multiple images supported)
          </span>
        </div>
      </div>

      {showAdjuster && pendingImages.length > 0 && (
        <ImageAdjuster
          imageUrl={pendingImages[0].url}
          targetDimensions={sourceImageDimensions}
          onConfirm={() => {}}
          onCancel={handleAdjusterCancel}
          onConfirmWithParams={handleAdjusterConfirmWithParams}
        />
      )}

      {isProcessing && pendingImages.length > 1 && (
        <div className="upload-angle-processing-overlay">
          <div className="upload-angle-processing-modal">
            <div className="upload-angle-processing-spinner" />
            <p>
              Processing images... {processingProgress} of {pendingImages.length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadAngleMode;
