/**
 * Maximum dimension (width or height) for uploaded images.
 * Images larger than this will be scaled down while maintaining aspect ratio.
 */
const MAX_IMAGE_DIMENSION = 2048;

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
