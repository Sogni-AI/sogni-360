/**
 * API Service
 *
 * Handles communication with the Sogni 360 backend API.
 */

import { API_URL } from '../config/urls';
import { getClientAppId } from '../utils/appId';
import type { GenerationProgressEvent, AzimuthKey, ElevationKey, DistanceKey } from '../types';
import { AZIMUTHS, ELEVATIONS, DISTANCES } from '../constants/cameraAngleSettings';

/**
 * Get the prompt text for an azimuth key
 */
function getAzimuthPrompt(key: AzimuthKey): string {
  const config = AZIMUTHS.find(a => a.key === key);
  return config?.prompt || 'front view';
}

/**
 * Get the prompt text for an elevation key
 */
function getElevationPrompt(key: ElevationKey): string {
  const config = ELEVATIONS.find(e => e.key === key);
  return config?.prompt || 'eye-level shot';
}

/**
 * Get the prompt text for a distance key
 */
function getDistancePrompt(key: DistanceKey): string {
  const config = DISTANCES.find(d => d.key === key);
  return config?.prompt || 'medium shot';
}

/**
 * API client for Sogni 360 backend
 */
class ApiClient {
  private baseUrl: string;
  private clientAppId: string;

  constructor() {
    this.baseUrl = API_URL;
    this.clientAppId = getClientAppId();
  }

  /**
   * Make a fetch request with standard headers
   */
  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-App-ID': this.clientAppId,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get client/server status
   */
  async getStatus(): Promise<{
    isAuthenticated: boolean;
    username?: string;
    balance?: { spark: number; sogni: number };
    error?: string;
  }> {
    return this.fetch('/api/sogni/status');
  }

  /**
   * Generate a camera angle image
   */
  async generateAngle(params: {
    contextImage: string; // Base64 or data URL
    azimuth: AzimuthKey;
    elevation: ElevationKey;
    distance: DistanceKey;
    width: number;
    height: number;
    tokenType?: 'spark' | 'sogni';
    loraStrength?: number;
    // Image quality settings
    imageModel?: string;
    imageSteps?: number;
    imageGuidance?: number;
    outputFormat?: 'jpg' | 'png';
  }): Promise<{ projectId: string; clientAppId: string }> {
    const response = await this.fetch<{
      success: boolean;
      projectId: string;
      clientAppId: string;
      message: string;
    }>('/api/sogni/generate-angle', {
      method: 'POST',
      body: JSON.stringify({
        contextImage: params.contextImage,
        azimuthPrompt: getAzimuthPrompt(params.azimuth),
        elevationPrompt: getElevationPrompt(params.elevation),
        distancePrompt: getDistancePrompt(params.distance),
        width: params.width,
        height: params.height,
        tokenType: params.tokenType || 'spark',
        loraStrength: params.loraStrength || 0.9,
        clientAppId: this.clientAppId,
        // Pass image quality settings to backend
        imageModel: params.imageModel,
        imageSteps: params.imageSteps,
        imageGuidance: params.imageGuidance,
        outputFormat: params.outputFormat || 'jpg',
      }),
    });

    return {
      projectId: response.projectId,
      clientAppId: response.clientAppId,
    };
  }

  /**
   * Generate a video transition between two images
   */
  async generateTransition(params: {
    referenceImage: Uint8Array | string;  // Start frame image
    referenceImageEnd: Uint8Array | string;  // End frame image
    prompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    frames?: number;
    fps?: number;  // Output video FPS (32fps for smooth playback)
    steps?: number;
    shift?: number;  // Motion intensity (model-specific: lightx2v 5.0, full 8.0)
    guidance?: number;  // Guidance scale (model-specific: lightx2v 1.0, full 4.0)
    model?: string;
    tokenType?: 'spark' | 'sogni';
  }): Promise<{ projectId: string; clientAppId: string }> {
    // Convert Uint8Array to base64 if needed
    const imageToBase64 = (data: Uint8Array | string): string => {
      if (typeof data === 'string') {
        return data;
      }
      // Convert Uint8Array to base64
      let binary = '';
      const len = data.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(data[i]);
      }
      return `data:image/png;base64,${btoa(binary)}`;
    };

    const response = await this.fetch<{
      success: boolean;
      projectId: string;
      clientAppId: string;
      message: string;
    }>('/api/sogni/generate-transition', {
      method: 'POST',
      body: JSON.stringify({
        referenceImage: imageToBase64(params.referenceImage),
        referenceImageEnd: imageToBase64(params.referenceImageEnd),
        prompt: params.prompt,
        negativePrompt: params.negativePrompt || '',
        width: params.width || 720,  // Default to 720p if not specified
        height: params.height || 720,
        frames: params.frames || 25,  // Default: 1.5s at 16fps base rate
        fps: params.fps || 32,  // Output fps (worker interpolates from 16fps base)
        steps: params.steps || 4,
        shift: params.shift,  // Model-specific motion intensity
        guidance: params.guidance,  // Model-specific guidance scale
        model: params.model || 'wan_v2.2-14b-fp8_i2v_lightx2v',
        tokenType: params.tokenType || 'spark',
        clientAppId: this.clientAppId,
      }),
    });

    return {
      projectId: response.projectId,
      clientAppId: response.clientAppId,
    };
  }

  /**
   * Enhance an image with Z-Image Turbo
   */
  async enhanceImage(params: {
    sourceImage: string; // Base64 or data URL
    width: number;
    height: number;
    tokenType?: 'spark' | 'sogni';
    prompt?: string; // Custom enhancement prompt
    steps?: number; // Z-Image inference steps (4-10)
  }): Promise<{ projectId: string; clientAppId: string }> {
    const response = await this.fetch<{
      success: boolean;
      projectId: string;
      clientAppId: string;
      message: string;
    }>('/api/sogni/enhance-image', {
      method: 'POST',
      body: JSON.stringify({
        sourceImage: params.sourceImage,
        width: params.width,
        height: params.height,
        tokenType: params.tokenType || 'spark',
        prompt: params.prompt || '(Extra detailed and contrasty portrait) Portrait masterpiece',
        steps: params.steps,
        clientAppId: this.clientAppId,
      }),
    });

    return {
      projectId: response.projectId,
      clientAppId: response.clientAppId,
    };
  }

  /**
   * Estimate generation cost
   */
  async estimateCost(params: {
    model: string;
    imageCount?: number;
    stepCount?: number;
    tokenType?: 'spark' | 'sogni';
    guideImage?: boolean; // For enhancement (img2img)
    denoiseStrength?: number; // For enhancement
    contextImages?: number;
  }): Promise<{ token: number; usd: number }> {
    return this.fetch('/api/sogni/estimate-cost', {
      method: 'POST',
      body: JSON.stringify({
        model: params.model,
        imageCount: params.imageCount || 1,
        previewCount: 5,
        stepCount: params.stepCount || 5,
        scheduler: 'simple',
        guidance: params.guideImage ? 3.5 : 1, // Z-Image Turbo uses 3.5
        contextImages: params.contextImages ?? 1,
        tokenType: params.tokenType || 'spark',
        guideImage: params.guideImage || false,
        denoiseStrength: params.denoiseStrength,
      }),
    });
  }

  /**
   * Subscribe to generation progress via SSE
   */
  subscribeToProgress(
    projectId: string,
    onEvent: (event: GenerationProgressEvent) => void,
    onError?: (error: Error) => void
  ): () => void {
    const url = `${this.baseUrl}/sogni/progress/${projectId}?clientAppId=${this.clientAppId}`;
    console.log(`[SSE] Connecting to ${url}`);

    const eventSource = new EventSource(url, {
      withCredentials: true,
    });

    eventSource.onopen = () => {
      console.log(`[SSE] Connection opened for project ${projectId}`);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as GenerationProgressEvent;
        console.log(`[SSE] Event received for ${projectId}:`, data.type, data);
        onEvent(data);

        // Close on completion or error
        if (data.type === 'completed' || data.type === 'error') {
          console.log(`[SSE] Closing connection for ${projectId} due to ${data.type}`);
          eventSource.close();
        }
      } catch (error) {
        console.error('[SSE] Error parsing event:', error, event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error(`[SSE] Connection error for ${projectId}:`, error, 'readyState:', eventSource.readyState);
      onError?.(new Error('SSE connection error'));
      eventSource.close();
    };

    // Return cleanup function
    return () => {
      console.log(`[SSE] Cleanup/unsubscribe for ${projectId}`);
      eventSource.close();
    };
  }

  /**
   * Refresh an expired signed URL for media (images or videos)
   * This is used when loading older projects where S3 presigned URLs have expired.
   */
  async refreshUrl(params: {
    sdkProjectId: string;
    sdkJobId: string;
    mediaType: 'image' | 'video';
  }): Promise<string> {
    const response = await this.fetch<{
      success: boolean;
      url: string;
    }>('/api/sogni/refresh-url', {
      method: 'POST',
      body: JSON.stringify({
        sdkProjectId: params.sdkProjectId,
        sdkJobId: params.sdkJobId,
        mediaType: params.mediaType,
      }),
    });

    return response.url;
  }

  /**
   * Disconnect from backend
   */
  async disconnect(): Promise<void> {
    try {
      await this.fetch('/api/sogni/disconnect', { method: 'POST' });
    } catch (error) {
      console.warn('Disconnect error:', error);
    }
  }
}

// Singleton instance
export const api = new ApiClient();

export default api;
