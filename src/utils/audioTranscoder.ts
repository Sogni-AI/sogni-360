/**
 * Audio Transcoder Utility
 *
 * Transcodes audio files (MP3, WAV) to M4A format via the backend FFmpeg service.
 * This matches how Photobooth handles audio transcoding.
 *
 * The video-concatenation.js uses MP4Box.js which can only mux AAC audio
 * in M4A/MP4 containers. MP3 and WAV files need to be transcoded first.
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Detect audio format from buffer magic bytes
 */
export function detectAudioFormat(buffer: ArrayBuffer): 'mp3' | 'wav' | 'm4a' | 'aac' | 'unknown' {
  const view = new Uint8Array(buffer);

  // MP3: ID3 tag (ID3) or sync word (0xFF 0xFB/0xFA/0xF3/0xF2)
  if (
    (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) || // ID3
    (view[0] === 0xFF && (view[1] & 0xE0) === 0xE0) // Sync word
  ) {
    return 'mp3';
  }

  // WAV: RIFF....WAVE
  if (
    view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46 && view[3] === 0x46 &&
    view[8] === 0x57 && view[9] === 0x41 && view[10] === 0x56 && view[11] === 0x45
  ) {
    return 'wav';
  }

  // M4A/MP4: ftyp box
  if (
    view[4] === 0x66 && view[5] === 0x74 && view[6] === 0x79 && view[7] === 0x70 // ftyp
  ) {
    return 'm4a';
  }

  // AAC ADTS: sync word 0xFFF
  if (view[0] === 0xFF && (view[1] & 0xF0) === 0xF0) {
    return 'aac';
  }

  return 'unknown';
}

/**
 * Check if audio format needs transcoding for MP4 muxing
 */
export function needsTranscoding(buffer: ArrayBuffer): boolean {
  const format = detectAudioFormat(buffer);
  // M4A/AAC are already in a format compatible with MP4 muxing
  // MP3 and WAV need to be transcoded to AAC
  return format === 'mp3' || format === 'wav';
}

/**
 * Transcode audio to M4A (AAC) format via backend FFmpeg service
 *
 * @param audioBuffer - The source audio buffer (MP3, WAV, etc.)
 * @param filename - Original filename (used for extension detection)
 * @param onProgress - Optional progress callback (not used for backend, but kept for API compatibility)
 * @returns ArrayBuffer containing M4A audio
 */
export async function transcodeToM4A(
  audioBuffer: ArrayBuffer,
  filename: string = 'audio.mp3',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _onProgress?: (progress: number) => void
): Promise<ArrayBuffer> {
  const format = detectAudioFormat(audioBuffer);
  console.log(`[AudioTranscoder] Input format detected: ${format}`);

  // If already M4A/AAC, return as-is
  if (format === 'm4a' || format === 'aac') {
    console.log('[AudioTranscoder] Already in compatible format, skipping transcode');
    return audioBuffer;
  }

  console.log(`[AudioTranscoder] Transcoding ${format.toUpperCase()} to M4A via backend...`);
  const startTime = Date.now();

  try {
    // Create FormData with the audio file
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
    formData.append('audio', blob, filename);

    // Send to backend for transcoding
    const response = await fetch(`${API_BASE}/api/audio/mp3-to-m4a`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.details || errorData.error || `Transcode failed: ${response.status}`);
    }

    const resultBuffer = await response.arrayBuffer();

    const elapsed = Date.now() - startTime;
    const inputSizeKB = Math.round(audioBuffer.byteLength / 1024);
    const outputSizeKB = Math.round(resultBuffer.byteLength / 1024);
    console.log(`[AudioTranscoder] Transcode complete in ${(elapsed / 1000).toFixed(1)}s - ${inputSizeKB}KB → ${outputSizeKB}KB`);

    return resultBuffer;
  } catch (error) {
    console.error('[AudioTranscoder] Transcode failed:', error);
    throw error;
  }
}

/**
 * Ensure audio is in M4A format for MP4 muxing
 * Transcodes if necessary, returns original if already compatible
 */
export async function ensureM4AFormat(
  audioBuffer: ArrayBuffer,
  filename: string = 'audio.mp3',
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer> {
  if (!needsTranscoding(audioBuffer)) {
    return audioBuffer;
  }
  return transcodeToM4A(audioBuffer, filename, onProgress);
}
