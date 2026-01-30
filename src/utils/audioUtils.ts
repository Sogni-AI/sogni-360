/**
 * Audio utilities for waveform generation and format handling
 */

// Hosts that need to be proxied due to CORS restrictions
const CORS_PROXY_HOSTS = [
  'pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev'
];

/**
 * Get a fetchable URL, using the proxy for CORS-restricted hosts
 */
function getProxiedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (CORS_PROXY_HOSTS.includes(parsed.hostname)) {
      return `/api/audio/proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // Invalid URL, return as-is
  }
  return url;
}

/**
 * Generate a normalized waveform array from an audio URL
 * @param audioUrl - URL of the audio file (blob: or https:)
 * @returns Array of 200 normalized amplitude values (0-1)
 */
export async function generateWaveform(audioUrl: string): Promise<number[]> {
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

  try {
    const response = await fetch(getProxiedUrl(audioUrl));
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const channelData = audioBuffer.getChannelData(0);
    const samples = 200;
    const blockSize = Math.floor(channelData.length / samples);
    const waveform: number[] = [];

    for (let i = 0; i < samples; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(channelData[i * blockSize + j]);
      }
      waveform.push(sum / blockSize);
    }

    // Normalize to 0-1 range
    const max = Math.max(...waveform);
    if (max === 0) return waveform.map(() => 0.1);
    return waveform.map(v => v / max);
  } finally {
    await audioContext.close();
  }
}

/**
 * Get audio duration from a URL
 */
export async function getAudioDuration(audioUrl: string): Promise<number> {
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

  try {
    const response = await fetch(getProxiedUrl(audioUrl));
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer.duration;
  } finally {
    await audioContext.close();
  }
}

/**
 * Format seconds as MM:SS
 */
export function formatAudioTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Validate an audio file for supported formats
 * Returns null if valid, error message if invalid
 */
export function validateAudioFile(file: File): string | null {
  const MAX_SIZE_MB = 50;
  const ALLOWED_TYPES = [
    'audio/mpeg',      // MP3
    'audio/mp3',       // MP3 (alt)
    'audio/mp4',       // M4A
    'audio/x-m4a',     // M4A (alt)
    'audio/aac',       // AAC
    'audio/wav',       // WAV
    'audio/wave',      // WAV (alt)
    'audio/x-wav'      // WAV (alt)
  ];

  // Check file size
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_SIZE_MB) {
    return `File too large (${sizeMB.toFixed(1)}MB). Maximum size is ${MAX_SIZE_MB}MB.`;
  }

  // Check file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    // Also check by extension as fallback
    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['mp3', 'm4a', 'aac', 'wav'];
    if (!ext || !allowedExtensions.includes(ext)) {
      return 'Unsupported format. Please use MP3, M4A, or WAV.';
    }
  }

  return null;
}

/**
 * Load audio as ArrayBuffer for video concatenation
 */
export async function loadAudioAsBuffer(audioUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(getProxiedUrl(audioUrl));
  if (!response.ok) {
    throw new Error(`Failed to load audio: ${response.status}`);
  }
  return response.arrayBuffer();
}
