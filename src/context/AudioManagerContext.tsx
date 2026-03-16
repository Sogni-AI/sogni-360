/**
 * AudioManagerContext
 *
 * Tracks registered <video> elements and manages which one has audio focus.
 * Only one video can be unmuted at a time to prevent overlapping audio.
 */

import React, { createContext, useContext, useRef, useState, useCallback, useMemo } from 'react';

interface AudioManagerAPI {
  register: (id: string, videoEl: HTMLVideoElement) => void;
  unregister: (id: string) => void;
  claimAudio: (id: string) => void;
  releaseAudio: (id: string) => void;
  activeAudioId: string | null;
}

const AudioManagerContext = createContext<AudioManagerAPI | null>(null);

export const AudioManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const videosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);

  const register = useCallback((id: string, videoEl: HTMLVideoElement) => {
    videosRef.current.set(id, videoEl);
  }, []);

  const unregister = useCallback((id: string) => {
    videosRef.current.delete(id);
    setActiveAudioId(prev => (prev === id ? null : prev));
  }, []);

  const claimAudio = useCallback((id: string) => {
    // Mute all other registered videos
    videosRef.current.forEach((el, elId) => {
      el.muted = elId !== id;
    });
    setActiveAudioId(id);
  }, []);

  const releaseAudio = useCallback((id: string) => {
    const el = videosRef.current.get(id);
    if (el) el.muted = true;
    setActiveAudioId(prev => (prev === id ? null : prev));
  }, []);

  const value = useMemo<AudioManagerAPI>(() => ({
    register,
    unregister,
    claimAudio,
    releaseAudio,
    activeAudioId,
  }), [register, unregister, claimAudio, releaseAudio, activeAudioId]);

  return (
    <AudioManagerContext.Provider value={value}>
      {children}
    </AudioManagerContext.Provider>
  );
};

export function useAudioManager(): AudioManagerAPI {
  const ctx = useContext(AudioManagerContext);
  if (!ctx) throw new Error('useAudioManager must be used within AudioManagerProvider');
  return ctx;
}
