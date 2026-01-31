import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Waypoint, AzimuthKey, ElevationKey, DistanceKey } from '../../types';
import CameraAngle3DControl from '../shared/CameraAngle3DControl';

interface CameraAngleModeProps {
  insertAfterIndex: number;
  onInsertAngle: (waypoint: Waypoint) => void;
}

const CameraAngleMode: React.FC<CameraAngleModeProps> = ({
  onInsertAngle
}) => {
  const [azimuth, setAzimuth] = useState<AzimuthKey>('front');
  const [elevation, setElevation] = useState<ElevationKey>('eye-level');
  const [distance, setDistance] = useState<DistanceKey>('close-up');

  const handleAddAngle = () => {
    const waypoint: Waypoint = {
      id: uuidv4(),
      azimuth,
      elevation,
      distance,
      status: 'pending',
      isOriginal: false
    };
    onInsertAngle(waypoint);
  };

  return (
    <div className="camera-angle-mode">
      <p className="camera-angle-mode-desc">
        Select a camera angle to generate. This will use AI to create a new view of your subject.
      </p>

      <div className="camera-angle-mode-control">
        <CameraAngle3DControl
          azimuth={azimuth}
          elevation={elevation}
          distance={distance}
          onAzimuthChange={setAzimuth}
          onElevationChange={setElevation}
          onDistanceChange={setDistance}
          size="card"
        />
      </div>

      <button className="btn btn-primary add-angle-btn" onClick={handleAddAngle}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Angle
      </button>
    </div>
  );
};

export default CameraAngleMode;
