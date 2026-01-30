import type { MusicSelection } from '../../../types';

export interface MusicSelectorProps {
  visible: boolean;
  onConfirm: (selection: MusicSelection) => void;
  onClose: () => void;
  onRemove?: () => void; // Called when user removes existing music
  currentSelection?: MusicSelection | null; // Existing music selection, if any
  videoDuration: number; // Total transition video duration in seconds
}

export type AudioSourceType = 'presets' | 'upload';

export interface AudioState {
  url: string | null;
  file: File | null;
  presetId: string | null;
  title: string;
  duration: number;
  waveform: number[];
  startOffset: number;
  selectedDuration: number;
}
