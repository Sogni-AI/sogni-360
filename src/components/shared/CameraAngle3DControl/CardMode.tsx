/**
 * CardMode - Compact interactive control for inline card use
 * Features: Vertical height on left, view cone, horizontal distance
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

interface CardModeProps {
  azimuth: AzimuthKey;
  elevation: ElevationKey;
  distance: DistanceKey;
  onAzimuthChange: (azimuth: AzimuthKey) => void;
  onElevationChange: (elevation: ElevationKey) => void;
  onDistanceChange: (distance: DistanceKey) => void;
  orbitalSize: number;
}

const CardMode: React.FC<CardModeProps> = ({
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

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '10px',
      background: COLORS.darkGray,
      borderRadius: '12px',
      border: `1px solid ${COLORS.border}`,
      width: '100%'
    }}>
      {/* Main row: Height | Orbital */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Vertical Height buttons on LEFT */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          background: COLORS.surfaceLight,
          borderRadius: '8px',
          padding: '3px',
          gap: '2px'
        }}>
          {elevationsReversed.map((el) => {
            const isSelected = el.key === elevation;
            const label = el.key === 'high-angle' ? 'High' :
                         el.key === 'elevated' ? 'Up' :
                         el.key === 'eye-level' ? 'Eye' : 'Low';
            return (
              <button
                key={el.key}
                onClick={() => onElevationChange(el.key)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: isSelected ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                  color: isSelected ? COLORS.textPrimary : COLORS.textMuted,
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: isSelected ? '600' : '500',
                  transition: 'all 0.15s ease',
                  minWidth: '40px',
                  minHeight: '28px'
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Orbital with rotate buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'center' }}>
          <button
            onClick={() => rotateCamera('ccw')}
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
              padding: 0,
              flexShrink: 0
            }}
            title="Rotate left"
          >
            ↻
          </button>

          <div
            ref={orbitRef}
            onClick={handleOrbitClick}
            style={{
              width: `${orbitalSize}px`,
              height: `${orbitalSize}px`,
              position: 'relative',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            {/* Azimuth dots */}
            {AZIMUTHS.map((az) => {
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
                    width: isSelected ? '10px' : '6px',
                    height: isSelected ? '10px' : '6px',
                    borderRadius: '50%',
                    background: isSelected ? COLORS.accent : 'rgba(255, 255, 255, 0.4)',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    opacity: behind ? 0.5 : 1,
                    zIndex: behind ? 1 : 6,
                    boxShadow: isSelected ? `0 0 8px ${COLORS.accentGlow}` : 'none'
                  }}
                />
              );
            })}

            {/* Sphere */}
            <div style={{
              position: 'absolute',
              inset: '15%',
              borderRadius: '50%',
              background: `radial-gradient(ellipse 70% 70% at 35% 35%, rgba(70, 70, 75, 0.6) 0%, rgba(25, 25, 30, 0.7) 100%)`,
              boxShadow: 'inset 0 0 15px rgba(0, 0, 0, 0.4)',
              zIndex: 3,
              pointerEvents: 'none'
            }} />

            {/* Subject */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '32px',
              opacity: 0.5,
              pointerEvents: 'none',
              zIndex: 4
            }}>
              👤
            </div>

            {/* Camera with view cone */}
            <div style={{
              position: 'absolute',
              left: `${cameraPosition.x}%`,
              top: `${cameraPosition.y}%`,
              transform: `translate(-50%, -50%) scale(${cameraScale * 0.8})`,
              transition: 'all 0.3s ease',
              pointerEvents: 'none',
              zIndex: isBehindSphere ? 2 : 10,
              opacity: isBehindSphere ? 0.6 : 1
            }}>
              {/* View cone SVG */}
              <svg
                width="80"
                height="100"
                viewBox="0 0 80 100"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: `translate(-50%, -50%) rotate(${Math.atan2(50 - cameraPosition.y, 50 - cameraPosition.x) * (180 / Math.PI) - 90}deg)`,
                  transformOrigin: '40px 50px',
                  pointerEvents: 'none',
                  zIndex: 20,
                  opacity: coneVisibility * (isBehindSphere ? 0.75 : 1),
                  transition: 'opacity 0.3s ease'
                }}
              >
                <defs>
                  <linearGradient id="coneGradientCard" x1="0%" y1="50%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={`rgba(59, 130, 246, ${0.5 * coneVisibility})`} />
                    <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
                  </linearGradient>
                </defs>
                <path
                  d={`M 40 50 L ${40 - Math.tan((lensAngle / 2) * Math.PI / 180) * 50 * coneVisibility} 100 L ${40 + Math.tan((lensAngle / 2) * Math.PI / 180) * 50 * coneVisibility} 100 Z`}
                  fill="url(#coneGradientCard)"
                />
              </svg>
              <div style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: COLORS.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 2px 8px ${COLORS.accentGlow}`
              }}>
                <span style={{ fontSize: '11px' }}>📷</span>
              </div>
            </div>

            {/* Azimuth label */}
            <div style={{
              position: 'absolute',
              bottom: '-2px',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '10px',
              fontWeight: '600',
              color: COLORS.textPrimary,
              textTransform: 'lowercase',
              zIndex: 10,
              whiteSpace: 'nowrap'
            }}>
              {currentAzimuth.label.toLowerCase()}
            </div>
          </div>

          <button
            onClick={() => rotateCamera('cw')}
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
              padding: 0,
              flexShrink: 0
            }}
            title="Rotate right"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Distance row */}
      <div style={{
        display: 'flex',
        background: COLORS.surfaceLight,
        borderRadius: '8px',
        padding: '3px',
        gap: '3px'
      }}>
        {DISTANCES.map((d) => {
          const isSelected = d.key === distance;
          const label = d.key === 'close-up' ? 'Close' :
                       d.key === 'medium' ? 'Medium' : 'Wide';
          return (
            <button
              key={d.key}
              onClick={() => onDistanceChange(d.key)}
              style={{
                flex: 1,
                padding: '6px 4px',
                borderRadius: '6px',
                border: 'none',
                background: isSelected ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                color: isSelected ? COLORS.textPrimary : COLORS.textMuted,
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: isSelected ? '600' : '500',
                transition: 'all 0.15s ease',
                minHeight: '28px'
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CardMode;
