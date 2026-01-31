import React, { useState, useRef, useEffect, useCallback } from 'react';
import './ImageAdjuster.css';

interface ImageAdjusterProps {
  imageUrl: string;
  targetDimensions: { width: number; height: number };
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

/**
 * Image adjustment component that allows users to pan and zoom an image,
 * then crop it to match the target aspect ratio.
 */
const ImageAdjuster: React.FC<ImageAdjusterProps> = ({
  imageUrl,
  targetDimensions,
  onConfirm,
  onCancel
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // For pinch zoom
  const [isPinching, setIsPinching] = useState(false);
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null);
  const [initialPinchScale, setInitialPinchScale] = useState(1);

  // Check if device has touch
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Reset state when imageUrl changes
  useEffect(() => {
    setPosition({ x: 0, y: 0 });
    setScale(1);
    setImageLoaded(false);
  }, [imageUrl]);

  const getDistance = (touch1: React.Touch, touch2: React.Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Calculate scale needed to cover (fill) the frame
  const calculateCoverScale = useCallback(() => {
    if (!imageRef.current || !imageRef.current.naturalWidth) return 1;

    const imageAspect = imageRef.current.naturalWidth / imageRef.current.naturalHeight;
    const targetAspect = targetDimensions.width / targetDimensions.height;

    // For "cover" mode, we want the image to fill the entire frame
    // If image is wider than target, scale based on height
    // If image is taller than target, scale based on width
    if (imageAspect > targetAspect) {
      // Image is wider - scale up so height fills frame
      return imageAspect / targetAspect;
    } else {
      // Image is taller - scale up so width fills frame
      return targetAspect / imageAspect;
    }
  }, [targetDimensions]);

  const handleImageLoad = useCallback(() => {
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
      // Set initial scale to cover (fill) the frame
      const coverScale = calculateCoverScale();
      setScale(coverScale);
      setImageLoaded(true);
    }
  }, [calculateCoverScale]);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch gesture
      e.preventDefault();
      setIsPinching(true);
      setInitialPinchDistance(getDistance(e.touches[0], e.touches[1]));
      setInitialPinchScale(scale);
    } else if (e.touches.length === 1) {
      // Drag gesture
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPinching && initialPinchDistance) {
      e.preventDefault();
      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      const scaleFactor = currentDistance / initialPinchDistance;
      const newScale = Math.min(Math.max(initialPinchScale * scaleFactor, 0.25), 3);
      setScale(newScale);
    } else if (e.touches.length === 1 && isDragging) {
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setIsPinching(false);
    setInitialPinchDistance(null);
  };

  // Scale slider handler
  const handleScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScale(parseFloat(e.target.value));
  };

  // Process and crop the image
  const processImage = useCallback(() => {
    return new Promise<Blob>((resolve, reject) => {
      if (!containerRef.current || !imageRef.current) {
        reject(new Error('Container or image ref not available'));
        return;
      }

      const image = imageRef.current;
      if (!image.complete || !image.naturalWidth || !image.naturalHeight) {
        reject(new Error('Image is not ready'));
        return;
      }

      const container = containerRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = targetDimensions.width;
      canvas.height = targetDimensions.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Fill with black background
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, targetDimensions.width, targetDimensions.height);

      // Calculate image dimensions to fit contain-style in container
      const imageAspect = image.naturalWidth / image.naturalHeight;
      const canvasAspect = targetDimensions.width / targetDimensions.height;

      let drawWidth: number, drawHeight: number;
      if (imageAspect > canvasAspect) {
        drawWidth = targetDimensions.width;
        drawHeight = targetDimensions.width / imageAspect;
      } else {
        drawHeight = targetDimensions.height;
        drawWidth = targetDimensions.height * imageAspect;
      }

      // Calculate scaling from screen to canvas coordinates
      const containerRect = container.getBoundingClientRect();
      const screenToCanvasX = targetDimensions.width / containerRect.width;
      const screenToCanvasY = targetDimensions.height / containerRect.height;

      // Apply scale
      drawWidth *= scale;
      drawHeight *= scale;

      // Center offset after scaling
      const scaledOffsetX = (targetDimensions.width - drawWidth) / 2;
      const scaledOffsetY = (targetDimensions.height - drawHeight) / 2;

      // Apply position
      const adjustedX = scaledOffsetX + position.x * screenToCanvasX;
      const adjustedY = scaledOffsetY + position.y * screenToCanvasY;

      ctx.drawImage(image, adjustedX, adjustedY, drawWidth, drawHeight);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        'image/jpeg',
        0.92
      );
    });
  }, [position, scale, targetDimensions]);

  const handleConfirm = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const blob = await processImage();
      onConfirm(blob);
    } catch (error) {
      console.error('Failed to process image:', error);
      setIsProcessing(false);
    }
  };

  const aspectRatio = targetDimensions.width / targetDimensions.height;

  return (
    <div className="image-adjuster-overlay" onClick={onCancel}>
      <div className="image-adjuster-modal" onClick={(e) => e.stopPropagation()}>
        <div className="image-adjuster-header">
          <h3>Adjust Image</h3>
          <button className="image-adjuster-close" onClick={onCancel}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="image-adjuster-body">
          <p className="image-adjuster-hint">
            {isTouchDevice ? 'Drag to position • Pinch to zoom' : 'Drag to position • Use slider to resize'}
          </p>

          <div
            className="image-adjuster-frame"
            ref={containerRef}
            style={{ aspectRatio: `${aspectRatio}` }}
          >
            <div className="image-adjuster-container">
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Adjust this image"
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                  cursor: isDragging ? 'grabbing' : 'grab',
                  opacity: imageLoaded ? 1 : 0
                }}
                onLoad={handleImageLoad}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                draggable={false}
              />
            </div>
            {/* Corner indicators */}
            <div className="frame-corner top-left" />
            <div className="frame-corner top-right" />
            <div className="frame-corner bottom-left" />
            <div className="frame-corner bottom-right" />
          </div>

          {!isTouchDevice && (
            <div className="image-adjuster-slider">
              <label htmlFor="zoom-slider">Size:</label>
              <input
                id="zoom-slider"
                type="range"
                min="0.25"
                max="3"
                step="0.01"
                value={scale}
                onChange={handleScaleChange}
              />
            </div>
          )}
        </div>

        <div className="image-adjuster-footer">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={isProcessing || !imageLoaded}
          >
            {isProcessing ? 'Processing...' : 'Use This Image'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageAdjuster;
