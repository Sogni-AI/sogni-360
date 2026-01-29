/**
 * CameraAngle3DControl
 *
 * Interactive control for selecting camera angles with a visual orbital representation.
 * Split into separate mode components for maintainability.
 */

import React from 'react';
import type { AzimuthKey, ElevationKey, DistanceKey } from '../../../types';
import CompactMode from './CompactMode';
import CardMode from './CardMode';
import FullMode from './FullMode';

interface CameraAngle3DControlProps {
  azimuth: AzimuthKey;
  elevation: ElevationKey;
  distance: DistanceKey;
  onAzimuthChange: (azimuth: AzimuthKey) => void;
  onElevationChange: (elevation: ElevationKey) => void;
  onDistanceChange: (distance: DistanceKey) => void;
  /** compact = tiny non-interactive indicator, card = small interactive, full = full size */
  size?: 'full' | 'card' | 'compact';
}

const CameraAngle3DControl: React.FC<CameraAngle3DControlProps> = ({
  azimuth,
  elevation,
  distance,
  onAzimuthChange,
  onElevationChange,
  onDistanceChange,
  size = 'full'
}) => {
  const orbitalSize = size === 'full' ? 200 : size === 'card' ? 120 : 80;

  if (size === 'compact') {
    return (
      <CompactMode
        azimuth={azimuth}
        elevation={elevation}
        orbitalSize={orbitalSize}
      />
    );
  }

  if (size === 'card') {
    return (
      <CardMode
        azimuth={azimuth}
        elevation={elevation}
        distance={distance}
        onAzimuthChange={onAzimuthChange}
        onElevationChange={onElevationChange}
        onDistanceChange={onDistanceChange}
        orbitalSize={orbitalSize}
      />
    );
  }

  return (
    <FullMode
      azimuth={azimuth}
      elevation={elevation}
      distance={distance}
      onAzimuthChange={onAzimuthChange}
      onElevationChange={onElevationChange}
      onDistanceChange={onDistanceChange}
      orbitalSize={orbitalSize}
    />
  );
};

export default CameraAngle3DControl;
