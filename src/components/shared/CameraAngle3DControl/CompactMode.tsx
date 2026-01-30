/**
 * CompactMode - Tiny non-interactive 3D indicator with lens cone
 */

import React from 'react';
import { COLORS, useCameraPosition, useCameraScale, useIsBehindSphere, useConeVisibility, useLensAngle } from './shared';
import { getAzimuthConfig, getElevationConfig, getDistanceConfig } from '../../../constants/cameraAngleSettings';

interface CompactModeProps {
  azimuth: string;
  elevation: string;
  distance?: string;
  orbitalSize: number;
}

const CompactMode: React.FC<CompactModeProps> = ({ azimuth, elevation, distance = 'medium', orbitalSize }) => {
  const currentAzimuth = getAzimuthConfig(azimuth as any);
  const currentElevation = getElevationConfig(elevation as any);
  const currentDistance = getDistanceConfig(distance as any);

  const cameraPosition = useCameraPosition(currentAzimuth.angle, currentElevation.angle);
  const cameraScale = useCameraScale(currentAzimuth.angle);
  const isBehindSphere = useIsBehindSphere(currentAzimuth.angle);
  const coneVisibility = useConeVisibility(currentAzimuth.angle, currentElevation.angle);
  const lensAngle = useLensAngle(currentDistance.key);

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
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: 'none',
        zIndex: isBehindSphere ? 2 : 10,
        opacity: isBehindSphere ? 0.6 : 1
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
            opacity: coneVisibility * (isBehindSphere ? 0.6 : 0.9),
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
          filter: isBehindSphere ? 'brightness(0.8)' : 'none',
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
