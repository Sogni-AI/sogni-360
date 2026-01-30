/**
 * Sonic Logos - Sogni Brand Sounds
 * Uses Web Audio API for cross-browser/device compatibility
 *
 * Sounds play when:
 * - Image angles finish generating (batch complete)
 * - Video transitions finish generating
 */

let audioContext: AudioContext | undefined;

const getAudioContext = (): AudioContext | undefined => {
  if (!audioContext) {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioContext = new AudioContextClass();
      }
    } catch {
      return undefined;
    }
  }
  if (audioContext?.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
};

/**
 * Pre-warms the AudioContext for iOS compatibility.
 * Call this during a user interaction (click/tap) BEFORE the async
 * callback that will play the sonic logo.
 */
export const warmUpAudio = (): void => {
  const context = getAudioContext();
  if (!context) return;

  try {
    const buffer = context.createBuffer(1, 1, 22_050);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
  } catch {
    // Silently fail
  }
};

// ============================================
// SOGNI SIGNATURE HD
// For: Batch completion, major milestones
// ============================================
export const playSogniSignature = (): void => {
  const context = getAudioContext();
  if (!context) return;

  const now = context.currentTime;

  const master = context.createGain();
  master.connect(context.destination);
  master.gain.setValueAtTime(0.3, now);

  // Sub bass
  const sub = context.createOscillator();
  const subGain = context.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(55, now + 0.05);
  subGain.gain.setValueAtTime(0, now + 0.05);
  subGain.gain.linearRampToValueAtTime(0.6, now + 0.13);
  subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
  sub.connect(subGain);
  subGain.connect(master);
  sub.start(now + 0.05);
  sub.stop(now + 0.65);

  // Whoosh
  const whoosh = context.createOscillator();
  const whooshGain = context.createGain();
  const whooshFilter = context.createBiquadFilter();
  whoosh.type = 'sawtooth';
  whoosh.frequency.setValueAtTime(80, now);
  whoosh.frequency.exponentialRampToValueAtTime(400, now + 0.15);
  whooshFilter.type = 'bandpass';
  whooshFilter.frequency.setValueAtTime(200, now);
  whooshFilter.frequency.exponentialRampToValueAtTime(1000, now + 0.15);
  whooshFilter.Q.setValueAtTime(0.5, now);
  whooshGain.gain.setValueAtTime(0, now);
  whooshGain.gain.linearRampToValueAtTime(0.2, now + 0.08);
  whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  whoosh.connect(whooshFilter);
  whooshFilter.connect(whooshGain);
  whooshGain.connect(master);
  whoosh.start(now);
  whoosh.stop(now + 0.2);

  // Stereo arpeggio with harmonics
  const notes = [349, 440, 523, 659];
  const pans = [-0.5, -0.15, 0.15, 0.5];

  for (const [index, freq] of notes.entries()) {
    const start = now + 0.1 + (index * 0.07);
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(pans[index], start);
    panner.connect(master);

    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.5, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    osc.connect(gain);
    gain.connect(panner);
    osc.start(start);
    osc.stop(start + 0.45);

    // Harmonic
    const osc2 = context.createOscillator();
    const gain2 = context.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, start);
    gain2.gain.setValueAtTime(0, start);
    gain2.gain.linearRampToValueAtTime(0.12, start + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
    osc2.connect(gain2);
    gain2.connect(panner);
    osc2.start(start);
    osc2.stop(start + 0.3);
  }

  // SOG-NI tag
  const endTime = now + 0.1 + (3 * 0.07) + 0.12;
  const pattern = [
    { freq: 784, start: 0, dur: 0.12, pan: -0.5 },
    { freq: 880, start: 0.1, dur: 0.12, pan: 0.5 },
    { freq: 1047, start: 0.2, dur: 0.4, pan: 0 }
  ];

  for (const { freq, start, dur, pan } of pattern) {
    const t = endTime + start;
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(pan, t);
    panner.connect(master);

    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.6, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(panner);
    osc.start(t);
    osc.stop(t + dur + 0.05);

    if (freq === 1047) {
      const osc2 = context.createOscillator();
      const gain2 = context.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, t);
      gain2.gain.setValueAtTime(0, t);
      gain2.gain.linearRampToValueAtTime(0.15, t + 0.01);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.6);
      osc2.connect(gain2);
      gain2.connect(panner);
      osc2.start(t);
      osc2.stop(t + dur * 0.7);
    }
  }
};

// ============================================
// SPARKLE CROWN HD
// For: Video/transition generation complete
// ============================================
export const playVideoComplete = (): void => {
  const context = getAudioContext();
  if (!context) return;

  const now = context.currentTime;

  const master = context.createGain();
  master.connect(context.destination);
  master.gain.setValueAtTime(0.28, now);

  // Warm bass bed
  const sub = context.createOscillator();
  const subGain = context.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(87, now + 0.05);
  subGain.gain.setValueAtTime(0, now + 0.05);
  subGain.gain.linearRampToValueAtTime(0.5, now + 0.12);
  subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
  sub.connect(subGain);
  subGain.connect(master);
  sub.start(now + 0.05);
  sub.stop(now + 0.65);

  // Whoosh
  const whoosh = context.createOscillator();
  const whooshGain = context.createGain();
  const whooshFilter = context.createBiquadFilter();
  whoosh.type = 'sawtooth';
  whoosh.frequency.setValueAtTime(80, now);
  whoosh.frequency.exponentialRampToValueAtTime(400, now + 0.15);
  whooshFilter.type = 'bandpass';
  whooshFilter.frequency.setValueAtTime(200, now);
  whooshFilter.frequency.exponentialRampToValueAtTime(1000, now + 0.15);
  whooshFilter.Q.setValueAtTime(0.5, now);
  whooshGain.gain.setValueAtTime(0, now);
  whooshGain.gain.linearRampToValueAtTime(0.2, now + 0.08);
  whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  whoosh.connect(whooshFilter);
  whooshFilter.connect(whooshGain);
  whooshGain.connect(master);
  whoosh.start(now);
  whoosh.stop(now + 0.2);

  // Stereo arpeggio
  const notes = [349, 440, 523, 659];
  const pans = [-0.4, -0.12, 0.12, 0.4];

  for (const [index, freq] of notes.entries()) {
    const start = now + 0.1 + (index * 0.07);
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(pans[index], start);
    panner.connect(master);

    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.5, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
    osc.connect(gain);
    gain.connect(panner);
    osc.start(start);
    osc.stop(start + 0.5);
  }

  // Sparkles dancing across stereo
  const sparkles = [1319, 1568, 1760, 1568, 2093];
  const sparklePans = [-0.7, 0.5, -0.3, 0.7, 0];

  for (const [index, freq] of sparkles.entries()) {
    const start = now + 0.18 + (index * 0.07);
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(sparklePans[index], start);
    panner.connect(master);

    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.2, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    osc.connect(gain);
    gain.connect(panner);
    osc.start(start);
    osc.stop(start + 0.25);
  }
};

// ============================================
// Sound Settings
// ============================================

const SOUND_ENABLED_KEY = 'sogni360_soundEnabled';

/**
 * Check if sound effects are enabled
 */
export const isSoundEnabled = (): boolean => {
  try {
    const stored = localStorage.getItem(SOUND_ENABLED_KEY);
    // Default to true if not set
    if (stored === undefined || stored === null) {
      return true;
    }
    return stored === 'true';
  } catch {
    return true;
  }
};

/**
 * Set sound effects enabled/disabled
 */
export const setSoundEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
  } catch {
    // Silently fail if localStorage unavailable
  }
};

// ============================================
// Convenience wrappers that respect settings
// ============================================

/**
 * Play the Sogni signature sound if enabled
 * Use for: batch completion, major milestones
 */
export const playSogniSignatureIfEnabled = (): void => {
  if (isSoundEnabled()) {
    playSogniSignature();
  }
};

/**
 * Play the video complete sound if enabled
 * Use for: individual video/transition completion
 */
export const playVideoCompleteIfEnabled = (): void => {
  if (isSoundEnabled()) {
    playVideoComplete();
  }
};

export default {
  warmUpAudio,
  playSogniSignature,
  playVideoComplete,
  playSogniSignatureIfEnabled,
  playVideoCompleteIfEnabled,
  isSoundEnabled,
  setSoundEnabled
};
