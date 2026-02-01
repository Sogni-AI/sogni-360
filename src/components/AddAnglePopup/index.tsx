import React, { useState } from 'react';
import type { Waypoint } from '../../types';
import CameraAngleMode from './CameraAngleMode';
import UploadAngleMode from './UploadAngleMode';
import './AddAnglePopup.css';

interface AddAnglePopupProps {
  isOpen: boolean;
  onClose: () => void;
  insertAfterIndex: number;
  sourceImageDimensions: { width: number; height: number };
  onInsertAngle: (waypoint: Waypoint) => void;
  onInsertAngles?: (waypoints: Waypoint[]) => void;
}

type Mode = 'camera' | 'upload';

const AddAnglePopup: React.FC<AddAnglePopupProps> = ({
  isOpen,
  onClose,
  insertAfterIndex,
  sourceImageDimensions,
  onInsertAngle,
  onInsertAngles
}) => {
  const [mode, setMode] = useState<Mode>('camera');

  if (!isOpen) return null;

  const handleInsertAngle = (waypoint: Waypoint) => {
    onInsertAngle(waypoint);
    onClose();
  };

  const handleInsertAngles = (waypoints: Waypoint[]) => {
    if (onInsertAngles) {
      onInsertAngles(waypoints);
    } else {
      // Fallback if batch handler not provided
      waypoints.forEach((wp) => onInsertAngle(wp));
    }
    onClose();
  };

  return (
    <div className="add-angle-popup-overlay" onClick={onClose}>
      <div className="add-angle-popup" onClick={(e) => e.stopPropagation()}>
        <div className="add-angle-popup-header">
          <h3>Add Angle</h3>
          <button className="add-angle-popup-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="add-angle-mode-tabs">
          <button
            className={`mode-tab ${mode === 'camera' ? 'active' : ''}`}
            onClick={() => setMode('camera')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <circle cx="12" cy="13" r="3" strokeWidth={2} />
            </svg>
            Select Angle
          </button>
          <button
            className={`mode-tab ${mode === 'upload' ? 'active' : ''}`}
            onClick={() => setMode('upload')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload Image
          </button>
        </div>

        <div className="add-angle-popup-body">
          {mode === 'camera' ? (
            <CameraAngleMode
              insertAfterIndex={insertAfterIndex}
              onInsertAngle={handleInsertAngle}
            />
          ) : (
            <UploadAngleMode
              insertAfterIndex={insertAfterIndex}
              sourceImageDimensions={sourceImageDimensions}
              onInsertAngle={handleInsertAngle}
              onInsertAngles={handleInsertAngles}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default AddAnglePopup;
