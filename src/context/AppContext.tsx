import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef, useState } from 'react';
import type {
  Sogni360State,
  Sogni360Action,
  Sogni360Project,
  Sogni360Settings,
  Waypoint,
  Segment,
  ProjectStatus
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { saveCurrentProject, getMostRecentProject, setCurrentProjectId, loadProject } from '../utils/localProjectsDB';
import { loadStitchedVideo } from '../utils/videoCache';
import { DEFAULT_VIDEO_SETTINGS } from '../constants/videoSettings';
import { getAdvancedSettings } from '../hooks/useAdvancedSettings';

// Key for persisting free generation usage in localStorage
const FREE_GENERATION_KEY = 'sogni360_has_used_free_generation';

/**
 * Strip ephemeral fields from project for save comparison.
 * These fields are transient (progress state, worker info) and should NOT:
 * 1. Trigger saves when they change
 * 2. Be persisted to storage (we don't restore them anyway)
 */
const getProjectForSaveComparison = (project: Sogni360Project): Sogni360Project => {
  return {
    ...project,
    // Strip ephemeral fields from waypoints
    waypoints: project.waypoints.map(wp => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { progress, enhancing, enhancementProgress, ...persistentFields } = wp;
      return persistentFields;
    }),
    // Strip ephemeral fields from segments
    segments: project.segments.map(seg => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { progress, workerName, ...persistentFields } = seg;
      return persistentFields;
    })
  };
};

// Check if free generation has been used (from localStorage)
const getHasUsedFreeGeneration = (): boolean => {
  try {
    return localStorage.getItem(FREE_GENERATION_KEY) === 'true';
  } catch {
    return false;
  }
};

// Persist free generation usage to localStorage
const setHasUsedFreeGenerationStorage = (value: boolean): void => {
  try {
    localStorage.setItem(FREE_GENERATION_KEY, value ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
};

// Initial state
const initialState: Sogni360State = {
  currentProject: null,
  currentWaypointIndex: 0,
  isPlaying: false,
  playbackDirection: 'forward',
  playbackSpeed: 1,
  videoTransition: null,
  uiVisible: true,
  showWaypointEditor: false,
  showAngleReview: false,
  showExportPanel: false,
  showProgressOverlay: false,
  showTransitionConfig: false,
  showTransitionReview: false,
  showFinalVideoPreview: false,
  showProjectManager: false,
  showLoginPrompt: false,
  isAuthenticated: false,
  authMode: null,
  walletBalance: null,
  hasUsedFreeGeneration: getHasUsedFreeGeneration()
};

// Get default project settings (reads from advanced settings for quality tiers)
const getDefaultSettings = (): Sogni360Settings => {
  const advancedSettings = getAdvancedSettings();
  return {
    videoQuality: advancedSettings.videoQuality,
    videoResolution: DEFAULT_VIDEO_SETTINGS.resolution,
    videoDuration: 3,
    tokenType: 'spark',
    // Transition settings - use video quality from advanced settings
    transitionQuality: advancedSettings.videoQuality,
    transitionDuration: DEFAULT_VIDEO_SETTINGS.duration,
    // Image generation settings
    imageModel: advancedSettings.imageModel,
    imageSteps: advancedSettings.imageSteps,
    imageGuidance: advancedSettings.imageGuidance
  };
};

// Reducer
function appReducer(state: Sogni360State, action: Sogni360Action): Sogni360State {
  switch (action.type) {
    case 'SET_PROJECT':
      return {
        ...state,
        currentProject: action.payload,
        currentWaypointIndex: 0,
        isPlaying: false
      };

    case 'SET_SOURCE_IMAGE': {
      const newProject: Sogni360Project = state.currentProject
        ? {
            ...state.currentProject,
            sourceImageUrl: action.payload.url,
            sourceImageDimensions: action.payload.dimensions,
            updatedAt: Date.now()
          }
        : {
            id: uuidv4(),
            name: 'Untitled Project',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            sourceImageUrl: action.payload.url,
            sourceImageDimensions: action.payload.dimensions,
            waypoints: [],
            segments: [],
            status: 'draft',
            settings: getDefaultSettings()
          };
      return { ...state, currentProject: newProject };
    }

    case 'ADD_WAYPOINT':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          waypoints: [...state.currentProject.waypoints, action.payload],
          updatedAt: Date.now()
        }
      };

    case 'INSERT_WAYPOINT': {
      if (!state.currentProject) return state;
      const newWaypoints = [...state.currentProject.waypoints];
      // afterIndex of -1 means insert at beginning, 0+ means insert after that index
      const insertIndex = action.payload.afterIndex + 1;
      newWaypoints.splice(insertIndex, 0, action.payload.waypoint);
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          waypoints: newWaypoints,
          updatedAt: Date.now()
        }
      };
    }

    case 'SET_WAYPOINTS':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          waypoints: action.payload,
          updatedAt: Date.now()
        },
        currentWaypointIndex: 0
      };

    case 'REMOVE_WAYPOINT':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          waypoints: state.currentProject.waypoints.filter(w => w.id !== action.payload),
          updatedAt: Date.now()
        }
      };

    case 'UPDATE_WAYPOINT':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          waypoints: state.currentProject.waypoints.map(w =>
            w.id === action.payload.id ? { ...w, ...action.payload.updates } : w
          ),
          updatedAt: Date.now()
        }
      };

    case 'ADD_WAYPOINT_VERSION':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          waypoints: state.currentProject.waypoints.map(w => {
            if (w.id !== action.payload.waypointId) return w;
            const history = w.imageHistory || [];
            // Add current imageUrl to history if it exists and isn't already there
            if (w.imageUrl && !history.includes(w.imageUrl)) {
              history.push(w.imageUrl);
            }
            // Add new image to history
            const newHistory = [...history, action.payload.imageUrl];
            return {
              ...w,
              imageUrl: action.payload.imageUrl,
              imageHistory: newHistory,
              currentImageIndex: newHistory.length - 1
            };
          }),
          updatedAt: Date.now()
        }
      };

    case 'SELECT_WAYPOINT_VERSION':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          waypoints: state.currentProject.waypoints.map(w => {
            if (w.id !== action.payload.waypointId || !w.imageHistory) return w;
            const index = Math.max(0, Math.min(action.payload.index, w.imageHistory.length - 1));
            return {
              ...w,
              imageUrl: w.imageHistory[index],
              currentImageIndex: index
            };
          }),
          updatedAt: Date.now()
        }
      };

    case 'REORDER_WAYPOINTS':
      if (!state.currentProject) return state;
      const waypointMap = new Map(state.currentProject.waypoints.map(w => [w.id, w]));
      const reorderedWaypoints = action.payload
        .map(id => waypointMap.get(id))
        .filter((w): w is Waypoint => w !== undefined);
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          waypoints: reorderedWaypoints,
          updatedAt: Date.now()
        }
      };

    case 'SET_SEGMENTS':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          segments: action.payload,
          updatedAt: Date.now()
        }
      };

    case 'REMOVE_SEGMENT':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          segments: state.currentProject.segments.filter(s => s.id !== action.payload),
          // Clear final loop URL and export state since segments changed
          finalLoopUrl: undefined,
          exportCompleted: false,
          updatedAt: Date.now()
        }
      };

    case 'ADD_SEGMENT':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          segments: [...state.currentProject.segments, action.payload],
          updatedAt: Date.now()
        }
      };

    case 'UPDATE_SEGMENT':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          segments: state.currentProject.segments.map(s =>
            s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
          ),
          updatedAt: Date.now()
        }
      };

    case 'ADD_SEGMENT_VERSION':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          segments: state.currentProject.segments.map(s => {
            if (s.id !== action.payload.segmentId) return s;
            const versions = s.versions || [];
            // Deselect all existing versions
            const updatedVersions = versions.map(v => ({ ...v, isSelected: false }));
            // Add new version as selected
            updatedVersions.push(action.payload.version);
            return {
              ...s,
              versions: updatedVersions,
              currentVersionIndex: updatedVersions.length - 1,
              videoUrl: action.payload.version.videoUrl
            };
          }),
          // Clear final loop URL and export state since a segment changed - needs regeneration
          finalLoopUrl: undefined,
          exportCompleted: false,
          updatedAt: Date.now()
        }
      };

    case 'SELECT_SEGMENT_VERSION':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          segments: state.currentProject.segments.map(s => {
            if (s.id !== action.payload.segmentId || !s.versions) return s;
            const updatedVersions = s.versions.map((v, i) => ({
              ...v,
              isSelected: i === action.payload.versionIndex
            }));
            const selectedVersion = updatedVersions[action.payload.versionIndex];
            return {
              ...s,
              versions: updatedVersions,
              currentVersionIndex: action.payload.versionIndex,
              videoUrl: selectedVersion?.videoUrl || s.videoUrl
            };
          }),
          // Clear final loop URL and export state since a segment version changed - needs regeneration
          finalLoopUrl: undefined,
          exportCompleted: false,
          updatedAt: Date.now()
        }
      };

    case 'SET_PROJECT_STATUS':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          status: action.payload,
          updatedAt: Date.now()
        }
      };

    case 'SET_CURRENT_WAYPOINT_INDEX':
      return { ...state, currentWaypointIndex: action.payload };

    case 'SET_PLAYING':
      return { ...state, isPlaying: action.payload };

    case 'SET_PLAYBACK_DIRECTION':
      return { ...state, playbackDirection: action.payload };

    case 'SET_PLAYBACK_SPEED':
      return { ...state, playbackSpeed: action.payload };

    case 'SET_UI_VISIBLE':
      return { ...state, uiVisible: action.payload };

    case 'SET_SHOW_WAYPOINT_EDITOR':
      return { ...state, showWaypointEditor: action.payload };

    case 'SET_SHOW_ANGLE_REVIEW':
      return { ...state, showAngleReview: action.payload };

    case 'SET_SHOW_EXPORT_PANEL':
      return { ...state, showExportPanel: action.payload };

    case 'SET_SHOW_PROGRESS_OVERLAY':
      return { ...state, showProgressOverlay: action.payload };

    case 'SET_SHOW_TRANSITION_CONFIG':
      return { ...state, showTransitionConfig: action.payload };

    case 'SET_SHOW_TRANSITION_REVIEW':
      return { ...state, showTransitionReview: action.payload };

    case 'SET_SHOW_FINAL_VIDEO_PREVIEW':
      return { ...state, showFinalVideoPreview: action.payload };

    case 'SET_SHOW_PROJECT_MANAGER':
      return { ...state, showProjectManager: action.payload };

    case 'SET_SHOW_LOGIN_PROMPT':
      return { ...state, showLoginPrompt: action.payload };

    case 'SET_HAS_USED_FREE_GENERATION':
      // Also persist to localStorage
      setHasUsedFreeGenerationStorage(action.payload);
      return { ...state, hasUsedFreeGeneration: action.payload };

    case 'SET_FINAL_LOOP_URL':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          finalLoopUrl: action.payload,
          // Also set exportCompleted when setting a valid URL
          exportCompleted: action.payload ? true : state.currentProject.exportCompleted,
          updatedAt: Date.now()
        }
      };

    case 'SET_EXPORT_COMPLETED':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          exportCompleted: action.payload,
          updatedAt: Date.now()
        }
      };

    case 'SET_AUTHENTICATED':
      return { ...state, isAuthenticated: action.payload };

    case 'SET_AUTH_MODE':
      return { ...state, authMode: action.payload };

    case 'SET_WALLET_BALANCE':
      return { ...state, walletBalance: action.payload };

    case 'UPDATE_SETTINGS':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          settings: { ...state.currentProject.settings, ...action.payload },
          updatedAt: Date.now()
        }
      };

    case 'SET_VIDEO_TRANSITION':
      return { ...state, videoTransition: action.payload };

    case 'SET_VIDEO_TRANSITION_READY':
      if (!state.videoTransition) return state;
      return {
        ...state,
        videoTransition: { ...state.videoTransition, isVideoReady: action.payload }
      };

    case 'SET_PROJECT_NAME':
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          name: action.payload,
          updatedAt: Date.now()
        }
      };

    case 'RESET_STATE':
      return initialState;

    default:
      return state;
  }
}

// Context type
interface AppContextType {
  state: Sogni360State;
  dispatch: React.Dispatch<Sogni360Action>;
  isRestoring: boolean;
  // Helper functions
  setSourceImage: (url: string, dimensions: { width: number; height: number }) => void;
  addWaypoint: (waypoint: Waypoint) => void;
  removeWaypoint: (id: string) => void;
  updateWaypoint: (id: string, updates: Partial<Waypoint>) => void;
  reorderWaypoints: (ids: string[]) => void;
  updateSegment: (id: string, updates: Partial<Segment>) => void;
  removeSegment: (id: string) => void;
  setProjectStatus: (status: ProjectStatus) => void;
  navigateToWaypoint: (index: number) => void;
  nextWaypoint: () => void;
  previousWaypoint: () => void;
  togglePlayback: () => void;
  setUIVisible: (visible: boolean) => void;
  clearProject: () => void;
  loadProjectById: (projectId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

// Debounce helper
function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [isRestoring, setIsRestoring] = useState(true);
  const hasRestoredRef = useRef(false);
  const lastSavedProjectRef = useRef<string | null>(null);

  // ===== Auto-Restore on Mount =====
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const restoreProject = async () => {
      try {
        console.log('[AppContext] Attempting to restore project...');
        const project = await getMostRecentProject();
        if (project) {
          console.log('[AppContext] Restored project:', project.id, project.name);

          // Try to restore cached video if project has segments but no finalLoopUrl
          const readySegmentUrls = project.segments
            ?.filter(s => s.status === 'ready' && s.videoUrl)
            .map(s => s.videoUrl) as string[] | undefined;
          if (readySegmentUrls && readySegmentUrls.length > 0 && !project.finalLoopUrl) {
            try {
              // Pass video URLs for validation - ensures cached video matches current segments
              const cachedBlob = await loadStitchedVideo(project.id, readySegmentUrls);
              if (cachedBlob) {
                console.log('[AppContext] Restoring cached final video');
                const blobUrl = URL.createObjectURL(cachedBlob);
                project.finalLoopUrl = blobUrl;
              }
            } catch (err) {
              console.warn('[AppContext] Failed to restore cached video:', err);
            }
          }

          dispatch({ type: 'SET_PROJECT', payload: project });
          lastSavedProjectRef.current = JSON.stringify(project);
        } else {
          console.log('[AppContext] No project to restore');
        }
      } catch (error) {
        console.error('[AppContext] Failed to restore project:', error);
      } finally {
        setIsRestoring(false);
      }
    };

    restoreProject();
  }, []);

  // ===== Auto-Save on Project Changes =====
  useEffect(() => {
    // Don't save during restore
    if (isRestoring) return;

    // Don't save if no project
    if (!state.currentProject) {
      lastSavedProjectRef.current = null;
      return;
    }

    // Strip ephemeral fields (progress, workerName, etc.) for comparison
    // These change frequently during generation but aren't worth persisting
    const projectForComparison = getProjectForSaveComparison(state.currentProject);
    const projectJson = JSON.stringify(projectForComparison);

    // Check if persistent fields actually changed
    if (projectJson === lastSavedProjectRef.current) return;

    // Debounced save
    const saveDebounced = debounce(async () => {
      try {
        // Save the stripped version (without ephemeral fields)
        const projectToSave = getProjectForSaveComparison(state.currentProject!);
        console.log('[AppContext] Auto-saving project:', projectToSave.id);
        await saveCurrentProject(projectToSave);
        lastSavedProjectRef.current = projectJson;
        console.log('[AppContext] Project saved successfully');
      } catch (error) {
        console.error('[AppContext] Failed to save project:', error);
      }
    }, 500);

    saveDebounced();
  }, [state.currentProject, isRestoring]);

  const setSourceImage = useCallback((url: string, dimensions: { width: number; height: number }) => {
    dispatch({ type: 'SET_SOURCE_IMAGE', payload: { url, dimensions } });
  }, []);

  const addWaypoint = useCallback((waypoint: Waypoint) => {
    dispatch({ type: 'ADD_WAYPOINT', payload: waypoint });
  }, []);

  const removeWaypoint = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_WAYPOINT', payload: id });
  }, []);

  const updateWaypoint = useCallback((id: string, updates: Partial<Waypoint>) => {
    dispatch({ type: 'UPDATE_WAYPOINT', payload: { id, updates } });
  }, []);

  const reorderWaypoints = useCallback((ids: string[]) => {
    dispatch({ type: 'REORDER_WAYPOINTS', payload: ids });
  }, []);

  const updateSegment = useCallback((id: string, updates: Partial<Segment>) => {
    dispatch({ type: 'UPDATE_SEGMENT', payload: { id, updates } });
  }, []);

  const removeSegment = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_SEGMENT', payload: id });
  }, []);

  const setProjectStatus = useCallback((status: ProjectStatus) => {
    dispatch({ type: 'SET_PROJECT_STATUS', payload: status });
  }, []);

  const navigateToWaypoint = useCallback((index: number) => {
    if (!state.currentProject) return;
    const maxIndex = state.currentProject.waypoints.length - 1;
    const clampedIndex = Math.max(0, Math.min(index, maxIndex));
    dispatch({ type: 'SET_CURRENT_WAYPOINT_INDEX', payload: clampedIndex });
  }, [state.currentProject]);

  const nextWaypoint = useCallback(() => {
    if (!state.currentProject) return;
    const maxIndex = state.currentProject.waypoints.length - 1;
    const newIndex = state.currentWaypointIndex >= maxIndex ? 0 : state.currentWaypointIndex + 1;
    dispatch({ type: 'SET_CURRENT_WAYPOINT_INDEX', payload: newIndex });
    dispatch({ type: 'SET_PLAYBACK_DIRECTION', payload: 'forward' });
  }, [state.currentProject, state.currentWaypointIndex]);

  const previousWaypoint = useCallback(() => {
    if (!state.currentProject) return;
    const maxIndex = state.currentProject.waypoints.length - 1;
    const newIndex = state.currentWaypointIndex <= 0 ? maxIndex : state.currentWaypointIndex - 1;
    dispatch({ type: 'SET_CURRENT_WAYPOINT_INDEX', payload: newIndex });
    dispatch({ type: 'SET_PLAYBACK_DIRECTION', payload: 'backward' });
  }, [state.currentProject, state.currentWaypointIndex]);

  const togglePlayback = useCallback(() => {
    dispatch({ type: 'SET_PLAYING', payload: !state.isPlaying });
  }, [state.isPlaying]);

  const setUIVisible = useCallback((visible: boolean) => {
    dispatch({ type: 'SET_UI_VISIBLE', payload: visible });
  }, []);

  const clearProject = useCallback(() => {
    dispatch({ type: 'SET_PROJECT', payload: null });
    setCurrentProjectId(null);
    lastSavedProjectRef.current = null;
  }, []);

  const loadProjectById = useCallback(async (projectId: string) => {
    try {
      const project = await loadProject(projectId);
      if (project) {
        // Try to restore cached video if project has segments but no finalLoopUrl
        const readySegmentUrls = project.segments
          ?.filter(s => s.status === 'ready' && s.videoUrl)
          .map(s => s.videoUrl) as string[] | undefined;
        if (readySegmentUrls && readySegmentUrls.length > 0 && !project.finalLoopUrl) {
          try {
            // Pass video URLs for validation - ensures cached video matches current segments
            const cachedBlob = await loadStitchedVideo(project.id, readySegmentUrls);
            if (cachedBlob) {
              console.log('[AppContext] Restoring cached final video for project:', projectId);
              const blobUrl = URL.createObjectURL(cachedBlob);
              project.finalLoopUrl = blobUrl;
            }
          } catch (err) {
            console.warn('[AppContext] Failed to restore cached video:', err);
          }
        }

        dispatch({ type: 'SET_PROJECT', payload: project });
        setCurrentProjectId(projectId);
        lastSavedProjectRef.current = JSON.stringify(project);
        console.log('[AppContext] Loaded project:', projectId);
      }
    } catch (error) {
      console.error('[AppContext] Failed to load project:', error);
    }
  }, []);

  const value: AppContextType = {
    state,
    dispatch,
    isRestoring,
    setSourceImage,
    addWaypoint,
    removeWaypoint,
    updateWaypoint,
    reorderWaypoints,
    updateSegment,
    removeSegment,
    setProjectStatus,
    navigateToWaypoint,
    nextWaypoint,
    previousWaypoint,
    togglePlayback,
    setUIVisible,
    clearProject,
    loadProjectById
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export default AppContext;
