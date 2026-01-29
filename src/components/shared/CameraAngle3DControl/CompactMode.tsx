/**
 * CompactMode - Tiny non-interactive 3D indicator
 */

import React from 'react';
import { COLORS, useCameraPosition, useCameraScale, useIsBehindSphere } from './shared';
import { getAzimuthConfig, getElevationConfig } from '../../../constants/cameraAngleSettings';

interface CompactModeProps {
  azimuth: string;
  elevation: string;
  orbitalSize: number;
}

const CompactMode: React.FC<CompactModeProps> = ({ azimuth, elevation, orbitalSize }) => {
  const currentAzimuth = getAzimuthConfig(azimuth as any);
  const currentElevation = getElevationConfig(elevation as any);

  const cameraPosition = useCameraPosition(currentAzimuth.angle, currentElevation.angle);
  const cameraScale = useCameraScale(currentAzimuth.angle);
  const isBehindSphere = useIsBehindSphere(currentAzimuth.angle);

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

      {/* Camera indicator */}
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
        <div style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: COLORS.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 2px 8px ${COLORS.accentGlow}`,
          filter: isBehindSphere ? 'brightness(0.8)' : 'none'
        }}>
          <span style={{ fontSize: '10px' }}>📷</span>
        </div>
      </div>
    </div>
  );
};

export default CompactMode;
