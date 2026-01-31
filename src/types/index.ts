// Sogni 360 Types

// Import camera angle types (will be defined in cameraAngle.ts)
import type { AzimuthKey, ElevationKey, DistanceKey } from './cameraAngle';

export type { AzimuthKey, ElevationKey, DistanceKey };

// Video settings - import and re-export from videoSettings constants for consistency
import type { VideoQualityPreset as VQP, VideoResolution as VR } from '../constants/videoSettings';
export type VideoQualityPreset = VQP;
export type VideoResolution = VR;

// Waypoint represents a single camera angle in the orbital path
export interface Waypoint {
  id: string;
  azimuth: AzimuthKey;
  elevation: ElevationKey;
  distance: DistanceKey;
  imageUrl?: string;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  progress?: number;
  error?: string;
  projectId?: string; // SDK project ID for tracking
  isOriginal?: boolean; // If true, use source image directly (no generation needed)
  imageHistory?: string[]; // History of all generated versions (for redo navigation)
  currentImageIndex?: number; // Index of currently displayed version in imageHistory
  // SDK IDs for URL refresh (needed when presigned URLs expire)
  sdkProjectId?: string; // Sogni SDK project ID
  sdkJobId?: string; // Sogni SDK job ID
  // Enhancement state
  enhancing?: boolean; // Currently enhancing this waypoint
  enhanced?: boolean; // Has been enhanced at least once
  enhancementProgress?: number; // 0-1 progress value during enhancement
  originalImageUrl?: string; // Original image before enhancement (for undo)
  enhancedImageUrl?: string; // Latest enhanced image (for redo)
  canUndoEnhance?: boolean; // Can undo enhancement
  canRedoEnhance?: boolean; // Can redo enhancement
}

// Single version of a generated transition video
export interface TransitionVersion {
  id: string;
  videoUrl: string;
  createdAt: number;
  isSelected: boolean; // Whether this version is the active one for stitching
  // SDK IDs for URL refresh (needed when presigned URLs expire)
  sdkProjectId?: string; // Sogni SDK project ID
  sdkJobId?: string; // Sogni SDK job ID
}

// Segment represents a video transition between two waypoints
export interface Segment {
  id: string;
  fromWaypointId: string;
  toWaypointId: string;
  videoUrl?: string; // Currently selected version's URL
  status: 'pending' | 'generating' | 'ready' | 'failed';
  progress?: number;
  error?: string;
  projectId?: string; // SDK project ID for tracking
  isReverse?: boolean; // If true, plays the video in reverse
  workerName?: string; // Worker name for display during generation
  versions?: TransitionVersion[]; // History of all generated versions
  currentVersionIndex?: number; // Index of currently selected version
  // SDK IDs for URL refresh (needed when presigned URLs expire)
  sdkProjectId?: string; // Sogni SDK project ID
  sdkJobId?: string; // Sogni SDK job ID
}

// Video generation quality presets
export type TransitionQuality = 'fast' | 'balanced' | 'quality' | 'pro';

// Image model types
export type ImageModelId = 'qwen_image_edit_2511_fp8_lightning' | 'qwen_image_edit_2511_fp8';

// Photo quality tier type (re-export from constants for convenience)
export type { PhotoQualityTier } from '../constants/cameraAngleSettings';

// Project settings
export interface Sogni360Settings {
  videoQuality: VideoQualityPreset;
  videoResolution: VideoResolution;
  videoDuration: number;
  tokenType: 'spark' | 'sogni';
  // Transition video settings
  transitionPrompt?: string;
  transitionQuality?: TransitionQuality;
  transitionDuration?: number; // Duration per clip in seconds
  // Music for final video
  musicSelection?: MusicSelection;
  // Advanced image generation settings
  imageModel?: ImageModelId;
  imageSteps?: number;
  imageGuidance?: number;
}

// Project status
export type ProjectStatus =
  | 'draft'
  | 'generating-angles'
  | 'generating-transitions'
  | 'complete';

// Full project structure
export interface Sogni360Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sourceImageUrl: string;
  sourceImageDimensions: { width: number; height: number };
  waypoints: Waypoint[];
  segments: Segment[];
  status: ProjectStatus;
  settings: Sogni360Settings;
  finalLoopUrl?: string;
  exportCompleted?: boolean; // Persists export completion state (since blob URLs don't survive refresh)
}

// Video transition state (for playing transitions between waypoints)
export interface VideoTransitionState {
  isPlaying: boolean;
  videoUrl: string;
  targetWaypointIndex: number;
  isVideoReady: boolean;
  playReverse?: boolean; // If true, play video backwards
}

// App state
export interface Sogni360State {
  // Project state
  currentProject: Sogni360Project | null;

  // Playback state
  currentWaypointIndex: number;
  isPlaying: boolean;
  playbackDirection: 'forward' | 'backward';
  playbackSpeed: number;

  // Video transition state
  videoTransition: VideoTransitionState | null;

  // UI state
  uiVisible: boolean;
  showWaypointEditor: boolean;
  showAngleReview: boolean;
  showExportPanel: boolean;
  showProgressOverlay: boolean;
  showTransitionConfig: boolean;
  showTransitionReview: boolean;
  showFinalVideoPreview: boolean;
  showProjectManager: boolean;
  showLoginPrompt: boolean;

  // Auth
  isAuthenticated: boolean;
  authMode: 'frontend' | 'demo' | null;
  walletBalance: { spark: number; sogni: number } | null;
  hasUsedFreeGeneration: boolean;
}

// Context actions
export type Sogni360Action =
  | { type: 'SET_PROJECT'; payload: Sogni360Project | null }
  | { type: 'SET_SOURCE_IMAGE'; payload: { url: string; dimensions: { width: number; height: number } } }
  | { type: 'ADD_WAYPOINT'; payload: Waypoint }
  | { type: 'INSERT_WAYPOINT'; payload: { afterIndex: number; waypoint: Waypoint } }
  | { type: 'SET_WAYPOINTS'; payload: Waypoint[] }
  | { type: 'REMOVE_WAYPOINT'; payload: string }
  | { type: 'UPDATE_WAYPOINT'; payload: { id: string; updates: Partial<Waypoint> } }
  | { type: 'ADD_WAYPOINT_VERSION'; payload: { waypointId: string; imageUrl: string } }
  | { type: 'SELECT_WAYPOINT_VERSION'; payload: { waypointId: string; index: number } }
  | { type: 'REORDER_WAYPOINTS'; payload: string[] }
  | { type: 'SET_SEGMENTS'; payload: Segment[] }
  | { type: 'ADD_SEGMENT'; payload: Segment }
  | { type: 'REMOVE_SEGMENT'; payload: string }
  | { type: 'UPDATE_SEGMENT'; payload: { id: string; updates: Partial<Segment> } }
  | { type: 'ADD_SEGMENT_VERSION'; payload: { segmentId: string; version: TransitionVersion } }
  | { type: 'SELECT_SEGMENT_VERSION'; payload: { segmentId: string; versionIndex: number } }
  | { type: 'SET_PROJECT_STATUS'; payload: ProjectStatus }
  | { type: 'SET_CURRENT_WAYPOINT_INDEX'; payload: number }
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'SET_PLAYBACK_DIRECTION'; payload: 'forward' | 'backward' }
  | { type: 'SET_PLAYBACK_SPEED'; payload: number }
  | { type: 'SET_UI_VISIBLE'; payload: boolean }
  | { type: 'SET_SHOW_WAYPOINT_EDITOR'; payload: boolean }
  | { type: 'SET_SHOW_ANGLE_REVIEW'; payload: boolean }
  | { type: 'SET_SHOW_EXPORT_PANEL'; payload: boolean }
  | { type: 'SET_SHOW_PROGRESS_OVERLAY'; payload: boolean }
  | { type: 'SET_SHOW_TRANSITION_CONFIG'; payload: boolean }
  | { type: 'SET_SHOW_TRANSITION_REVIEW'; payload: boolean }
  | { type: 'SET_SHOW_FINAL_VIDEO_PREVIEW'; payload: boolean }
  | { type: 'SET_SHOW_PROJECT_MANAGER'; payload: boolean }
  | { type: 'SET_FINAL_LOOP_URL'; payload: string | undefined }
  | { type: 'SET_EXPORT_COMPLETED'; payload: boolean }
  | { type: 'SET_AUTHENTICATED'; payload: boolean }
  | { type: 'SET_AUTH_MODE'; payload: 'frontend' | 'demo' | null }
  | { type: 'SET_WALLET_BALANCE'; payload: { spark: number; sogni: number } | null }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Sogni360Settings> }
  | { type: 'SET_VIDEO_TRANSITION'; payload: VideoTransitionState | null }
  | { type: 'SET_VIDEO_TRANSITION_READY'; payload: boolean }
  | { type: 'SET_PROJECT_NAME'; payload: string }
  | { type: 'SET_SHOW_LOGIN_PROMPT'; payload: boolean }
  | { type: 'SET_HAS_USED_FREE_GENERATION'; payload: boolean }
  | { type: 'RESET_STATE' };

// Generation event types
export interface GenerationProgressEvent {
  type: 'connected' | 'queued' | 'started' | 'progress' | 'jobCompleted' | 'completed' | 'error' | 'preview' | 'initiating';
  projectId: string;
  jobId?: string;
  progress?: number;
  resultUrl?: string;
  previewUrl?: string;
  imageUrls?: string[]; // Array of result URLs (sent with 'completed' event)
  error?: string;
  message?: string; // Backend sends error messages in this field
  errorCode?: string;
  workerName?: string;
  queuePosition?: number;
  // SDK IDs for URL refresh (needed when presigned URLs expire)
  sdkProjectId?: string; // Sogni SDK project ID
  sdkJobId?: string; // Sogni SDK job ID
}

// Local project for IndexedDB storage
export interface LocalProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnailUrl?: string;
  project: Sogni360Project;
}

// Cost estimation
export interface CostEstimate {
  totalSpark: number;
  totalSogni: number;
  breakdown: {
    angles: number;
    transitions: number;
  };
}

// Music selection for final video
export interface MusicSelection {
  type: 'preset' | 'upload';
  file?: File;
  presetUrl?: string;
  presetId?: string;
  title?: string;
  startOffset: number;    // Trim start (seconds)
  duration: number;       // Selected duration (seconds)
  totalDuration: number;  // Full audio duration
  waveform?: number[];    // For visualization
}

// Audio options for video concatenation
export interface AudioOptions {
  buffer: ArrayBuffer;
  startOffset?: number;
}
