/**
 * Shared utilities, types, and constants for CameraAngle3DControl
 */

import { useMemo, useCallback, useRef } from 'react';
import {
  AZIMUTHS,
  ELEVATIONS,
  type AzimuthKey,
  getAzimuthConfig,
  getElevationConfig,
  getDistanceConfig
} from '../../../constants/cameraAngleSettings';

export interface CameraAngle3DControlProps {
  azimuth: AzimuthKey;
  elevation: string;
  distance: string;
  onAzimuthChange: (azimuth: AzimuthKey) => void;
  onElevationChange: (elevation: string) => void;
  onDistanceChange: (distance: string) => void;
  size?: 'full' | 'card' | 'compact';
}

export const COLORS = {
  accent: '#667eea',
  accentSoft: '#764ba2',
  black: '#000000',
  white: '#FFFFFF',
  textPrimary: 'rgba(255, 255, 255, 0.95)',
  textSecondary: 'rgba(255, 255, 255, 0.65)',
  textMuted: 'rgba(255, 255, 255, 0.4)',
  darkGray: 'rgba(30, 32, 38, 0.95)',
  surfaceLight: 'rgba(255, 255, 255, 0.08)',
  surfaceGlass: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.05) 100%)',
  border: 'rgba(255, 255, 255, 0.15)',
  borderLight: 'rgba(255, 255, 255, 0.22)',
  accentGlow: 'rgba(102, 126, 234, 0.5)'
};

export function getPositionForAngle(angle: number) {
  const angleRad = (angle * Math.PI) / 180;
  const radius = 40;
  const perspectiveFactor = 0.4;
  return {
    x: 50 + radius * Math.sin(angleRad),
    y: 50 + radius * Math.cos(angleRad) * perspectiveFactor
  };
}

export function isAngleBehind(angle: number) {
  const angleRad = (angle * Math.PI) / 180;
  return Math.cos(angleRad) < -0.3;
}

export function useCameraPosition(azimuthAngle: number, elevationAngle: number) {
  return useMemo(() => {
    const angleRad = (azimuthAngle * Math.PI) / 180;
    const baseRadius = 36;
    const perspectiveFactor = 0.4;

    const x = 50 + baseRadius * Math.sin(angleRad);
    const baseY = 50 + baseRadius * Math.cos(angleRad) * perspectiveFactor;
    const eyeLevelOffset = -8;
    const elevationOffset = -elevationAngle * 0.4 + eyeLevelOffset;

    return { x, y: baseY + elevationOffset };
  }, [azimuthAngle, elevationAngle]);
}

export function useConeVisibility(azimuthAngle: number, elevationAngle: number) {
  return useMemo(() => {
    const azimuthRad = (azimuthAngle * Math.PI) / 180;
    const azimuthVisibility = Math.abs(Math.sin(azimuthRad));
    const elevationVisibility = Math.abs(elevationAngle) / 60;
    return Math.max(azimuthVisibility, elevationVisibility);
  }, [azimuthAngle, elevationAngle]);
}

export function useLensAngle(distanceKey: string) {
  return useMemo(() => {
    switch (distanceKey) {
      case 'close-up': return 25;
      case 'medium': return 45;
      case 'wide': return 70;
      default: return 45;
    }
  }, [distanceKey]);
}

export function useCameraScale(azimuthAngle: number) {
  return useMemo(() => {
    const angleRad = (azimuthAngle * Math.PI) / 180;
    return 1 + Math.cos(angleRad) * 0.3;
  }, [azimuthAngle]);
}

export function useIsBehindSphere(azimuthAngle: number) {
  return useMemo(() => {
    const angleRad = (azimuthAngle * Math.PI) / 180;
    return Math.cos(angleRad) < -0.3;
  }, [azimuthAngle]);
}

export function useOrbitClick(onAzimuthChange: (key: AzimuthKey) => void) {
  const orbitRef = useRef<HTMLDivElement>(null);

  const handleOrbitClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!orbitRef.current) return;

    const rect = orbitRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const clickX = e.clientX - rect.left - centerX;
    const clickY = e.clientY - rect.top - centerY;

    let angle = Math.atan2(clickX, clickY) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    let closestAzimuth: typeof AZIMUTHS[number] = AZIMUTHS[0];
    let minDiff = 360;

    for (const az of AZIMUTHS) {
      let diff = Math.abs(az.angle - angle);
      if (diff > 180) diff = 360 - diff;
      if (diff < minDiff) {
        minDiff = diff;
        closestAzimuth = az;
      }
    }

    onAzimuthChange(closestAzimuth.key);
  }, [onAzimuthChange]);

  return { orbitRef, handleOrbitClick };
}

export function useRotateCamera(azimuth: AzimuthKey, onAzimuthChange: (key: AzimuthKey) => void) {
  return useCallback((direction: 'cw' | 'ccw') => {
    const currentIndex = AZIMUTHS.findIndex(a => a.key === azimuth);
    const newIndex = direction === 'cw'
      ? (currentIndex + 1) % AZIMUTHS.length
      : (currentIndex - 1 + AZIMUTHS.length) % AZIMUTHS.length;
    onAzimuthChange(AZIMUTHS[newIndex].key);
  }, [azimuth, onAzimuthChange]);
}

export { AZIMUTHS, ELEVATIONS, getAzimuthConfig, getElevationConfig, getDistanceConfig };
