/**
 * CompactMode - Tiny non-interactive 3D indicator with lens cone
 * Supports animated transitions when target props are provided
 */

import React, { useMemo, useEffect, useLayoutEffect, useState, useRef } from 'react';
import { COLORS, useCameraPosition, useCameraScale, useIsBehindSphere, useConeVisibility, useLensAngle } from './shared';
import { getAzimuthConfig, getElevationConfig, getDistanceConfig } from '../../../constants/cameraAngleSettings';

interface CompactModeProps {
  azimuth: string;
  elevation: string;
  distance?: string;
  orbitalSize: number;
  // Optional animation props - when provided, animates from current to target
  targetAzimuth?: string;
  targetElevation?: string;
  targetDistance?: string;
  animationDuration?: number; // in seconds
  isAnimating?: boolean;
}

const CompactMode: React.FC<CompactModeProps> = ({
  azimuth,
  elevation,
  distance = 'medium',
  orbitalSize,
  targetAzimuth,
  targetElevation,
  targetDistance,
  animationDuration = 0.3,
  isAnimating = false
}) => {
  const currentAzimuth = getAzimuthConfig(azimuth as any);
  const currentElevation = getElevationConfig(elevation as any);
  const currentDistance = getDistanceConfig(distance as any);

  // Target configs (when animating)
  const targetAzimuthConfig = targetAzimuth ? getAzimuthConfig(targetAzimuth as any) : null;
  const targetElevationConfig = targetElevation ? getElevationConfig(targetElevation as any) : null;
  const targetDistanceConfig = targetDistance ? getDistanceConfig(targetDistance as any) : null;

  // Use animation progress to interpolate between current and target
  const [animProgress, setAnimProgress] = useState(0);
  // Track the animation frame ID so we can cancel it on cleanup
  const animFrameRef = useRef<number | null>(null);
  // Track which target we're animating to (prevents stale progress on new animations)
  const animTargetRef = useRef<string | null>(null);

  // Synchronously reset progress when animation target changes (before paint)
  // This prevents any frame where stale progress is shown
  const currentTargetKey = targetAzimuthConfig ? `${targetAzimuth}-${targetElevation}-${targetDistance}` : null;
  useLayoutEffect(() => {
    if (animTargetRef.current !== currentTargetKey) {
      animTargetRef.current = currentTargetKey;
      setAnimProgress(0);
    }
  }, [currentTargetKey]);

  useEffect(() => {
    // Cancel any running animation frame
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (isAnimating && targetAzimuthConfig) {
      // Start animation immediately - no delay needed since video is already playing
      const startTime = performance.now();
      const duration = animationDuration * 1000;

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic for smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 3);
        setAnimProgress(eased);

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          animFrameRef.current = null;
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);

      return () => {
        if (animFrameRef.current !== null) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
      };
    }
  }, [isAnimating, targetAzimuthConfig, animationDuration]);

  // Interpolate angle values for smooth animation
  const displayAzimuthAngle = useMemo(() => {
    if (!isAnimating || !targetAzimuthConfig) return currentAzimuth.angle;

    // Handle wrap-around for azimuth (e.g., 350° to 10°)
    let start = currentAzimuth.angle;
    let end = targetAzimuthConfig.angle;
    let diff = end - start;

    // Take the shortest path around the circle
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    return start + diff * animProgress;
  }, [currentAzimuth.angle, targetAzimuthConfig, animProgress, isAnimating]);

  const displayElevationAngle = useMemo(() => {
    if (!isAnimating || !targetElevationConfig) return currentElevation.angle;
    const start = currentElevation.angle;
    const end = targetElevationConfig.angle;
    return start + (end - start) * animProgress;
  }, [currentElevation.angle, targetElevationConfig, animProgress, isAnimating]);

  const displayDistanceKey = useMemo(() => {
    // Distance doesn't interpolate smoothly, just use current or target based on progress
    if (!isAnimating || !targetDistanceConfig) return currentDistance.key;
    return animProgress > 0.5 ? targetDistanceConfig.key : currentDistance.key;
  }, [currentDistance.key, targetDistanceConfig, animProgress, isAnimating]);

  const cameraPosition = useCameraPosition(displayAzimuthAngle, displayElevationAngle);
  const cameraScale = useCameraScale(displayAzimuthAngle);
  const isBehindSphere = useIsBehindSphere(displayAzimuthAngle);
  const coneVisibility = useConeVisibility(displayAzimuthAngle, displayElevationAngle);
  const lensAngle = useLensAngle(displayDistanceKey);

  // Calculate cone rotation to point toward center (avatar)
  const coneRotation = Math.atan2(50 - cameraPosition.y, 50 - cameraPosition.x) * (180 / Math.PI) - 90;

  return (
    <div style={{
      position: 'relative',
      width: `${orbitalSize}px`,
      height: `${orbitalSize}px`
    }}>
      {/* Semi-transparent sphere */}
      <div style={{
        position: 'absolute',
        inset: '12%',
        borderRadius: '50%',
        background: `
          radial-gradient(
            ellipse 70% 70% at 35% 35%,
            rgba(70, 70, 75, 0.6) 0%,
            rgba(45, 45, 50, 0.65) 40%,
            rgba(25, 25, 30, 0.7) 70%,
            rgba(15, 15, 18, 0.75) 100%
          )
        `,
        boxShadow: `
          inset 0 0 20px rgba(0, 0, 0, 0.4),
          0 4px 16px rgba(0, 0, 0, 0.4)
        `,
        zIndex: 3,
        pointerEvents: 'none'
      }} />

      {/* Orbital ring */}
      <div style={{
        position: 'absolute',
        inset: '8%',
        border: `1px dashed rgba(255, 255, 255, 0.15)`,
        borderRadius: '50%',
        transform: 'rotateX(60deg)',
        transformStyle: 'preserve-3d',
        zIndex: 4,
        pointerEvents: 'none'
      }} />

      {/* Subject silhouette */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: '28px',
        opacity: 0.5,
        pointerEvents: 'none',
        zIndex: 4
      }}>
        👤
      </div>

      {/* Camera indicator with lens cone */}
      <div style={{
        position: 'absolute',
        left: `${cameraPosition.x}%`,
        top: `${cameraPosition.y}%`,
        transform: `translate(-50%, -50%) scale(${cameraScale * 0.6})`,
        // Use CSS transition only when not using JS animation
        transition: isAnimating ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: 'none',
        zIndex: isBehindSphere ? 2 : 10,
        opacity: 1
      }}>
        {/* Lens cone - visibility based on angle */}
        <svg
          width="60"
          height="70"
          viewBox="0 0 60 70"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) rotate(${coneRotation}deg)`,
            transformOrigin: '30px 35px',
            pointerEvents: 'none',
            zIndex: 5,
            opacity: coneVisibility * 0.9,
            transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <defs>
            <linearGradient id="coneFadeCompact" x1="0%" y1="50%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={`rgba(59, 130, 246, ${0.5 * coneVisibility})`} />
              <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
            </linearGradient>
          </defs>
          <path
            d={`M 30 35 L ${30 - Math.tan((lensAngle / 2) * Math.PI / 180) * 35 * coneVisibility} 70 L ${30 + Math.tan((lensAngle / 2) * Math.PI / 180) * 35 * coneVisibility} 70 Z`}
            fill="url(#coneFadeCompact)"
          />
        </svg>

        {/* Camera icon */}
        <div style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: COLORS.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 2px 8px ${COLORS.accentGlow}`,
          position: 'relative',
          zIndex: 10
        }}>
          <span style={{ fontSize: '10px' }}>📷</span>
        </div>
      </div>
    </div>
  );
};

export default CompactMode;
