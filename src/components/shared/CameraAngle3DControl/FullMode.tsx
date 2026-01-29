/**
 * FullMode - Full-size interactive control with all features
 */

import React from 'react';
import {
  COLORS,
  AZIMUTHS,
  ELEVATIONS,
  getPositionForAngle,
  isAngleBehind,
  useCameraPosition,
  useConeVisibility,
  useLensAngle,
  useCameraScale,
  useIsBehindSphere,
  useOrbitClick,
  useRotateCamera,
  getAzimuthConfig,
  getElevationConfig
} from './shared';
import { DISTANCES } from '../../../constants/cameraAngleSettings';
import type { AzimuthKey, ElevationKey, DistanceKey } from '../../../types';

interface FullModeProps {
  azimuth: AzimuthKey;
  elevation: ElevationKey;
  distance: DistanceKey;
  onAzimuthChange: (azimuth: AzimuthKey) => void;
  onElevationChange: (elevation: ElevationKey) => void;
  onDistanceChange: (distance: DistanceKey) => void;
  orbitalSize: number;
}

const FullMode: React.FC<FullModeProps> = ({
  azimuth,
  elevation,
  distance,
  onAzimuthChange,
  onElevationChange,
  onDistanceChange,
  orbitalSize
}) => {
  const currentAzimuth = getAzimuthConfig(azimuth);
  const currentElevation = getElevationConfig(elevation);

  const cameraPosition = useCameraPosition(currentAzimuth.angle, currentElevation.angle);
  const coneVisibility = useConeVisibility(currentAzimuth.angle, currentElevation.angle);
  const lensAngle = useLensAngle(distance);
  const cameraScale = useCameraScale(currentAzimuth.angle);
  const isBehindSphere = useIsBehindSphere(currentAzimuth.angle);
  const { orbitRef, handleOrbitClick } = useOrbitClick(onAzimuthChange);
  const rotateCamera = useRotateCamera(azimuth, onAzimuthChange);

  const elevationsReversed = [...ELEVATIONS].reverse();

  const renderAzimuthDot = (az: typeof AZIMUTHS[number]) => {
    const pos = getPositionForAngle(az.angle);
    const behind = isAngleBehind(az.angle);
    const isSelected = az.key === azimuth;

    return (
      <button
        key={az.key}
        onClick={(e) => { e.stopPropagation(); onAzimuthChange(az.key); }}
        style={{
          position: 'absolute',
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          transform: 'translate(-50%, -50%)',
          width: isSelected ? '14px' : behind ? '8px' : '10px',
          height: isSelected ? '14px' : behind ? '8px' : '10px',
          borderRadius: '50%',
          background: isSelected ? COLORS.accent : behind ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.5)',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isSelected ? `0 0 12px ${COLORS.accentGlow}` : 'none',
          padding: 0,
          opacity: behind ? 0.7 : 1,
          zIndex: behind ? 1 : 6
        }}
        title={az.label}
      />
    );
  };

  const renderCamera = () => (
    <div style={{
      position: 'absolute',
      left: `${cameraPosition.x}%`,
      top: `${cameraPosition.y}%`,
      transform: `translate(-50%, -50%) scale(${cameraScale})`,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      pointerEvents: 'none',
      zIndex: isBehindSphere ? 2 : 10,
      opacity: isBehindSphere ? 0.7 : 1
    }}>
      <svg
        width="100"
        height="120"
        viewBox="0 0 100 120"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) rotate(${Math.atan2(50 - cameraPosition.y, 50 - cameraPosition.x) * (180 / Math.PI) - 90}deg)`,
          transformOrigin: '50px 60px',
          pointerEvents: 'none',
          zIndex: 20,
          opacity: coneVisibility * (isBehindSphere ? 0.75 : 1),
          transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <defs>
          <linearGradient id="coneFade" x1="0%" y1="50%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={`rgba(59, 130, 246, ${0.6 * coneVisibility})`} />
            <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
          </linearGradient>
        </defs>
        <path
          d={`M 50 60 L ${50 - Math.tan((lensAngle / 2) * Math.PI / 180) * 60 * coneVisibility} 120 L ${50 + Math.tan((lensAngle / 2) * Math.PI / 180) * 60 * coneVisibility} 120 Z`}
          fill="url(#coneFade)"
        />
      </svg>
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: COLORS.accent,
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 10,
        boxShadow: `0 2px 12px ${COLORS.accentGlow}`,
        filter: isBehindSphere ? 'brightness(0.8)' : 'none'
      }}>
        <span style={{ fontSize: '16px' }}>📷</span>
      </div>
    </div>
  );

  return (
    <div className="camera-angle-3d-control" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      padding: '16px',
      background: COLORS.darkGray,
      borderRadius: '16px',
      border: `1px solid ${COLORS.border}`,
      overflow: 'hidden'
    }}>
      {/* Main Control Area */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Vertical Height Slider */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            fontSize: '10px',
            fontWeight: '600',
            color: COLORS.textSecondary,
            marginBottom: '6px',
            textTransform: 'lowercase',
            letterSpacing: '0.5px'
          }}>
            height
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            background: COLORS.surfaceLight,
            borderRadius: '10px',
            padding: '4px',
            gap: '2px'
          }}>
            {elevationsReversed.map((el) => {
              const isSelected = el.key === elevation;
              const label = el.key === 'high-angle' ? 'high' :
                           el.key === 'elevated' ? 'up' :
                           el.key === 'eye-level' ? 'eye' : 'low';
              return (
                <button
                  key={el.key}
                  onClick={() => onElevationChange(el.key)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: isSelected ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                    color: isSelected ? COLORS.textPrimary : COLORS.textMuted,
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: isSelected ? '600' : '500',
                    transition: 'all 0.15s ease',
                    minWidth: '44px',
                    textTransform: 'lowercase'
                  }}
                  title={el.label}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Rotate Left */}
        <button
          onClick={(e) => { e.stopPropagation(); rotateCamera('ccw'); }}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: `1px solid ${COLORS.border}`,
            background: 'rgba(30, 30, 30, 0.9)',
            color: COLORS.textSecondary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            transition: 'all 0.2s ease',
            fontWeight: '500',
            flexShrink: 0
          }}
          title="Rotate camera left"
        >
          ↻
        </button>

        {/* Orbital View */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <div
            ref={orbitRef}
            onClick={handleOrbitClick}
            style={{ width: `${orbitalSize}px`, height: `${orbitalSize}px`, position: 'relative', cursor: 'pointer' }}
          >
            {AZIMUTHS.map(renderAzimuthDot)}

            {/* Sphere */}
            <div style={{
              position: 'absolute',
              inset: '12%',
              borderRadius: '50%',
              background: `radial-gradient(ellipse 70% 70% at 35% 35%, rgba(70, 70, 75, 0.6) 0%, rgba(45, 45, 50, 0.65) 40%, rgba(25, 25, 30, 0.7) 70%, rgba(15, 15, 18, 0.75) 100%)`,
              boxShadow: `inset 0 0 40px rgba(0, 0, 0, 0.4), 0 8px 32px rgba(0, 0, 0, 0.4)`,
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

            {/* Subject */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '64px',
              opacity: 0.6,
              pointerEvents: 'none',
              zIndex: 4
            }}>
              👤
            </div>

            {renderCamera()}

            {/* Angle label */}
            <div style={{
              position: 'absolute',
              bottom: '-4px',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '12px',
              fontWeight: '600',
              color: COLORS.textPrimary,
              textShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
              whiteSpace: 'nowrap',
              textTransform: 'lowercase',
              zIndex: 10
            }}>
              {currentAzimuth.label.toLowerCase()}
            </div>
          </div>
        </div>

        {/* Rotate Right */}
        <button
          onClick={(e) => { e.stopPropagation(); rotateCamera('cw'); }}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: `1px solid ${COLORS.border}`,
            background: 'rgba(30, 30, 30, 0.9)',
            color: COLORS.textSecondary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            transition: 'all 0.2s ease',
            fontWeight: '500',
            flexShrink: 0
          }}
          title="Rotate camera right"
        >
          ↺
        </button>
      </div>

      {/* Distance Slider */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textSecondary, textTransform: 'lowercase', letterSpacing: '0.5px' }}>
          distance
        </div>
        <div style={{ display: 'flex', background: COLORS.surfaceLight, borderRadius: '10px', padding: '4px', gap: '2px', width: 'fit-content' }}>
          {DISTANCES.map((dist) => {
            const isSelected = dist.key === distance;
            const label = dist.key === 'close-up' ? 'close' : dist.key === 'medium' ? 'medium' : 'wide';
            return (
              <button
                key={dist.key}
                onClick={() => onDistanceChange(dist.key)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isSelected ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                  color: isSelected ? COLORS.textPrimary : COLORS.textMuted,
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: isSelected ? '600' : '500',
                  transition: 'all 0.15s ease',
                  minWidth: '60px',
                  textTransform: 'lowercase'
                }}
                title={dist.label}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <div style={{
        textAlign: 'center',
        padding: '10px 16px',
        background: COLORS.surfaceLight,
        borderRadius: '10px',
        fontSize: '12px',
        fontWeight: '500',
        color: COLORS.textSecondary,
        textTransform: 'lowercase',
        letterSpacing: '0.3px'
      }}>
        {currentAzimuth.label.toLowerCase()} · {currentElevation.label.toLowerCase()} · {distance}
      </div>
    </div>
  );
};

export default FullMode;
