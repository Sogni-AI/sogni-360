/**
 * FullMode - Full-size interactive control with all features
 */

import React, { useState, useEffect } from 'react';
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
  orbitalSize: baseOrbitalSize
}) => {
  // Track mobile portrait mode for responsive sizing
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);

  useEffect(() => {
    const checkMobilePortrait = () => {
      setIsMobilePortrait(window.innerWidth < 500);
    };
    checkMobilePortrait();
    window.addEventListener('resize', checkMobilePortrait);
    return () => window.removeEventListener('resize', checkMobilePortrait);
  }, []);

  // Use smaller orbital on mobile portrait
  const orbitalSize = isMobilePortrait ? Math.min(baseOrbitalSize, 180) : baseOrbitalSize;

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
      gap: isMobilePortrait ? '10px' : '12px',
      padding: isMobilePortrait ? '12px' : '14px',
      borderRadius: '16px',
      overflow: 'hidden',
      width: 'fit-content',
      maxWidth: '100%',
      margin: '0 auto',
      background: 'rgba(15, 15, 20, 0.3)',
      border: '1px solid transparent',
      boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.5), inset 0 -1px 0 0 rgba(255, 255, 255, 0.06), 0 0 0 1px rgba(255, 255, 255, 0.15), 0 2px 8px rgba(0, 0, 0, 0.15), 0 8px 24px rgba(0, 0, 0, 0.1)'
    }}>
      {/* Main Control Area - Height buttons on left, Orbital on right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Vertical Height Slider */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            fontSize: '10px',
            fontWeight: '600',
            color: COLORS.textSecondary,
            marginBottom: '4px',
            textTransform: 'lowercase',
            letterSpacing: '0.5px'
          }}>
            height
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%)',
            borderRadius: '10px',
            padding: '4px',
            gap: '2px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
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
                    padding: isMobilePortrait ? '5px 8px' : '6px 10px',
                    borderRadius: '8px',
                    border: isSelected ? '1px solid rgba(102, 126, 234, 0.5)' : '1px solid transparent',
                    background: isSelected
                      ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.25) 0%, rgba(118, 75, 162, 0.15) 100%)'
                      : 'transparent',
                    color: isSelected ? '#c4b5fd' : COLORS.textMuted,
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: isSelected ? '600' : '500',
                    transition: 'all 0.2s ease',
                    minWidth: isMobilePortrait ? '36px' : '40px',
                    textTransform: 'lowercase',
                    boxShadow: isSelected ? '0 2px 8px rgba(102, 126, 234, 0.2)' : 'none'
                  }}
                  title={el.label}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Orbital View with rotate buttons and label below */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          <div
            ref={orbitRef}
            onClick={handleOrbitClick}
            style={{ width: `${orbitalSize}px`, height: `${orbitalSize}px`, aspectRatio: '1', position: 'relative', cursor: 'pointer', flexShrink: 0 }}
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
              fontSize: isMobilePortrait ? '48px' : '56px',
              opacity: 0.6,
              pointerEvents: 'none',
              zIndex: 4
            }}>
              👤
            </div>

            {renderCamera()}
          </div>

          {/* Rotate buttons flanking the azimuth label */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: isMobilePortrait ? '2px' : '4px'
          }}>
            <button
              onClick={(e) => { e.stopPropagation(); rotateCamera('ccw'); }}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.04) 100%)',
                color: COLORS.textSecondary,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                transition: 'all 0.2s ease',
                fontWeight: '500',
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)'
              }}
              title="Rotate camera left"
            >
              ↻
            </button>
            <span style={{
              fontSize: '11px',
              fontWeight: '600',
              color: COLORS.textPrimary,
              whiteSpace: 'nowrap',
              textTransform: 'lowercase'
            }}>
              {currentAzimuth.label.toLowerCase()}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); rotateCamera('cw'); }}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.04) 100%)',
                color: COLORS.textSecondary,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                transition: 'all 0.2s ease',
                fontWeight: '500',
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)'
              }}
              title="Rotate camera right"
            >
              ↺
            </button>
          </div>
        </div>
      </div>

      {/* Distance buttons - compact row */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{
          display: 'flex',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%)',
          borderRadius: '10px',
          padding: '4px',
          gap: '2px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
        }}>
          {DISTANCES.map((dist) => {
            const isSelected = dist.key === distance;
            const label = dist.key === 'close-up' ? 'close' : dist.key === 'medium' ? 'medium' : 'wide';
            return (
              <button
                key={dist.key}
                onClick={() => onDistanceChange(dist.key)}
                style={{
                  padding: isMobilePortrait ? '5px 12px' : '6px 16px',
                  borderRadius: '8px',
                  border: isSelected ? '1px solid rgba(102, 126, 234, 0.5)' : '1px solid transparent',
                  background: isSelected
                    ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.25) 0%, rgba(118, 75, 162, 0.15) 100%)'
                    : 'transparent',
                  color: isSelected ? '#c4b5fd' : COLORS.textMuted,
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: isSelected ? '600' : '500',
                  transition: 'all 0.2s ease',
                  textTransform: 'lowercase',
                  boxShadow: isSelected ? '0 2px 8px rgba(102, 126, 234, 0.2)' : 'none'
                }}
                title={dist.label}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary - more compact */}
      <div style={{
        textAlign: 'center',
        padding: isMobilePortrait ? '4px 10px' : '8px 14px',
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%)',
        borderRadius: '10px',
        fontSize: '11px',
        fontWeight: '500',
        color: COLORS.textSecondary,
        textTransform: 'lowercase',
        letterSpacing: '0.3px',
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        {currentAzimuth.label.toLowerCase()} · {currentElevation.label.toLowerCase()} · {distance}
      </div>
    </div>
  );
};

export default FullMode;
