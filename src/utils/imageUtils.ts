/**
 * Maximum dimension (width or height) for uploaded images.
 * Images larger than this will be scaled down while maintaining aspect ratio.
 * Set to 1280px since video export is currently capped at 720p.
 */
const MAX_IMAGE_DIMENSION = 1280;

/**
 * Resizes an image if its longest dimension exceeds the maximum allowed size.
 * Maintains aspect ratio and quality during resize.
 *
 * @param dataUrl - The image as a data URL
 * @param dimensions - The original image dimensions
 * @returns Promise containing the (possibly resized) data URL and final dimensions
 */
export async function resizeImageIfNeeded(
  dataUrl: string,
  dimensions: { width: number; height: number }
): Promise<{ dataUrl: string; dimensions: { width: number; height: number } }> {
  const { width, height } = dimensions;
  const longestSide = Math.max(width, height);

  // No resize needed if within limits
  if (longestSide <= MAX_IMAGE_DIMENSION) {
    return { dataUrl, dimensions };
  }

  // Calculate new dimensions maintaining aspect ratio
  const scale = MAX_IMAGE_DIMENSION / longestSide;
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  // Create canvas and resize
  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Use high-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Load image and draw to canvas
  const img = await loadImage(dataUrl);
  ctx.drawImage(img, 0, 0, newWidth, newHeight);

  // Export as high-quality JPEG (or PNG if original was PNG)
  const isPng = dataUrl.startsWith('data:image/png');
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  const quality = isPng ? undefined : 0.92;

  const resizedDataUrl = canvas.toDataURL(mimeType, quality);

  return {
    dataUrl: resizedDataUrl,
    dimensions: { width: newWidth, height: newHeight }
  };
}

/**
 * Normalize an image to match target dimensions using center+cover crop.
 * Scales the image to cover the target area, then crops from center.
 * Returns a blob URL of the normalized image.
 */
export async function normalizeImageToTargetDimensions(
  imageUrl: string,
  targetDimensions: { width: number; height: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
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

      // Calculate cover dimensions (scale to fill, then crop from center)
      const sourceAspect = img.naturalWidth / img.naturalHeight;
      const targetAspect = targetDimensions.width / targetDimensions.height;

      let drawWidth: number, drawHeight: number;
      let offsetX: number, offsetY: number;

      if (sourceAspect > targetAspect) {
        // Source is wider - fit by height, crop width
        drawHeight = targetDimensions.height;
        drawWidth = drawHeight * sourceAspect;
        offsetX = (targetDimensions.width - drawWidth) / 2;
        offsetY = 0;
      } else {
        // Source is taller - fit by width, crop height
        drawWidth = targetDimensions.width;
        drawHeight = drawWidth / sourceAspect;
        offsetX = 0;
        offsetY = (targetDimensions.height - drawHeight) / 2;
      }

      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

      // Return as blob URL
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        'image/jpeg',
        0.95
      );
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = imageUrl;
  });
}

/**
 * Loads an image from a data URL and returns a promise that resolves when loaded.
 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Gets the dimensions of an image from a data URL.
 */
export function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Converts a blob URL to a base64 data URL.
 * If the URL is already a data URL or a regular HTTP(S) URL, returns it unchanged.
 */
export async function ensureDataUrl(url: string): Promise<string> {
  // Already a data URL - return as-is
  if (url.startsWith('data:')) {
    return url;
  }

  // Blob URL - fetch and convert to data URL
  if (url.startsWith('blob:')) {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert blob to data URL'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Regular HTTP(S) URL - return as-is (backend can fetch these)
  return url;
}
