import React, { useState, useMemo } from 'react';
import ImageAdjuster from './shared/ImageAdjuster';
import {
  ASPECT_RATIO_PRESETS,
  computeTargetDimensions,
  type AspectRatioPreset,
} from '../constants/aspectRatioPresets';

/** Reduce a width:height pair to simplest whole-number ratio. */
function simplifyRatio(w: number, h: number): [number, number] {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(Math.round(w), Math.round(h));
  return [Math.round(w / d), Math.round(h / d)];
}

interface SourceImageAdjusterProps {
  imageUrl: string;
  originalDimensions: { width: number; height: number };
  onConfirm: (blobUrl: string, dimensions: { width: number; height: number }) => void;
  onCancel: () => void;
}

/**
 * Wraps ImageAdjuster with an aspect ratio preset dropdown.
 * Shown after the user uploads a source image, before project creation.
 */
const SourceImageAdjuster: React.FC<SourceImageAdjusterProps> = ({
  imageUrl,
  originalDimensions,
  onConfirm,
  onCancel,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState('original');

  const targetDimensions = useMemo(() => {
    if (selectedPresetId === 'original') {
      return originalDimensions;
    }
    const preset = ASPECT_RATIO_PRESETS.find(p => p.id === selectedPresetId);
    if (!preset) return originalDimensions;
    return computeTargetDimensions(preset.ratio);
  }, [selectedPresetId, originalDimensions]);

  const handleConfirm = (blob: Blob) => {
    const blobUrl = URL.createObjectURL(blob);
    onConfirm(blobUrl, targetDimensions);
  };

  const originalRatioLabel = useMemo(() => {
    const [rw, rh] = simplifyRatio(originalDimensions.width, originalDimensions.height);
    return `Original (${rw}:${rh})`;
  }, [originalDimensions]);

  // Group presets by category for the dropdown
  const groupedPresets = useMemo(() => {
    const groups: Record<string, AspectRatioPreset[]> = {};
    for (const preset of ASPECT_RATIO_PRESETS) {
      if (!groups[preset.category]) groups[preset.category] = [];
      groups[preset.category].push(preset);
    }
    return groups;
  }, []);

  const aspectRatioDropdown = (
    <div className="source-adjuster-preset-row">
      <label htmlFor="aspect-ratio-select" className="source-adjuster-label">
        Aspect Ratio
      </label>
      <select
        id="aspect-ratio-select"
        className="settings-select source-adjuster-select"
        value={selectedPresetId}
        onChange={(e) => setSelectedPresetId(e.target.value)}
      >
        {Object.entries(groupedPresets).map(([category, presets]) => (
          <optgroup key={category} label={category}>
            {presets.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.id === 'original' ? originalRatioLabel : preset.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );

  return (
    <ImageAdjuster
      key={selectedPresetId}
      imageUrl={imageUrl}
      targetDimensions={targetDimensions}
      onConfirm={handleConfirm}
      onCancel={onCancel}
      title="Adjust Your Image"
      confirmLabel="Continue"
      extraControls={aspectRatioDropdown}
    />
  );
};

export default SourceImageAdjuster;
