/**
 * Shared image URL conversion utilities.
 *
 * Handles all URL types: data: URIs, http(s) URLs (with S3 CORS fallback),
 * blob: URLs, and raw base64 strings.
 */

import { fetchS3AsBlob } from './s3FetchWithFallback';

/**
 * Convert any image URL to a Blob.
 * Extracted from TransitionGenerator.ts for reuse across services.
 */
export async function imageUrlToBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    const [header, base64Data] = url.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  } else if (url.startsWith('http')) {
    return fetchS3AsBlob(url);
  } else if (url.startsWith('blob:')) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }
    return response.blob();
  } else {
    // Assume raw base64
    const binaryString = atob(url);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'image/jpeg' });
  }
}

/**
 * Convert any image URL to a base64 data URI.
 * Uses imageUrlToBlob internally, then converts to data URI via FileReader.
 */
export async function imageUrlToDataUri(url: string): Promise<string> {
  // data: URIs can pass through directly
  if (url.startsWith('data:')) {
    return url;
  }

  const blob = await imageUrlToBlob(url);

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not return a string'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
