/**
 * useTransitionPrompts — Manages prompt mode (all/each), per-segment prompts,
 * preset selection, and AI expansion for the transition config panel.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { Segment, Waypoint } from '../types';
import {
  TRANSITION_PROMPT_PRESETS,
  getDefaultTransitionPrompt,
  findPresetByPrompt,
} from '../constants/transitionPromptPresets';
import { isFrontendMode } from '../services/frontend';
import { analyzeTransition } from '../services/AITransitionAnalyzer';
import { useToast } from '../context/ToastContext';
import { getAzimuthConfig, getElevationConfig } from '../constants/cameraAngleSettings';
import { getOriginalLabel } from '../utils/waypointLabels';

export type PromptMode = 'all' | 'each';

interface UseTransitionPromptsParams {
  savedPrompt?: string;
  savedPromptMode?: PromptMode;
  savedPerSegmentPrompts?: Record<string, string>; // pair-keyed from project settings
  segments: Segment[];
  waypoints: Waypoint[];
  videoModel?: string;
  onPersistPrompts?: (pairKeyedPrompts: Record<string, string>, mode: PromptMode) => void;
}

export function useTransitionPrompts({
  savedPrompt, savedPromptMode, savedPerSegmentPrompts,
  segments, waypoints, videoModel, onPersistPrompts,
}: UseTransitionPromptsParams) {
  const { showToast } = useToast();
  const defaultPrompt = getDefaultTransitionPrompt();

  // ── Prompt mode ─────────────────────────────────────────────────────
  const [promptMode, setPromptMode] = useState<PromptMode>(savedPromptMode ?? 'all');

  // ── Shared prompt (all mode) ────────────────────────────────────────
  const [transitionPrompt, setTransitionPrompt] = useState(savedPrompt || defaultPrompt);

  // ── Preset selection ────────────────────────────────────────────────
  const selectedPresetId = useMemo(() => {
    const preset = findPresetByPrompt(transitionPrompt);
    return preset?.id || 'custom';
  }, [transitionPrompt]);

  const handlePresetChange = useCallback((presetId: string) => {
    if (presetId === 'custom') return;
    const preset = TRANSITION_PROMPT_PRESETS.find(p => p.id === presetId);
    if (preset) setTransitionPrompt(preset.prompt);
  }, []);

  // ── Per-segment prompts (each mode) ─────────────────────────────────
  // Initialize from saved pair-keyed prompts, converting to segment-ID keys
  const [perSegmentPrompts, setPerSegmentPrompts] = useState<Record<string, string>>(() => {
    if (!savedPerSegmentPrompts) return {};
    const result: Record<string, string> = {};
    for (const seg of segments) {
      const pairKey = `${seg.fromWaypointId}->${seg.toWaypointId}`;
      if (pairKey in savedPerSegmentPrompts) {
        result[seg.id] = savedPerSegmentPrompts[pairKey];
      }
    }
    return result;
  });

  const setSegmentPrompt = useCallback((segmentId: string, prompt: string) => {
    setPerSegmentPrompts(prev => ({ ...prev, [segmentId]: prompt }));
  }, []);

  // ── Refs for latest values (used in async callbacks to avoid stale closures) ──
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const promptRef = useRef(transitionPrompt);
  promptRef.current = transitionPrompt;
  const perSegRef = useRef(perSegmentPrompts);
  perSegRef.current = perSegmentPrompts;
  const videoModelRef = useRef(videoModel);
  videoModelRef.current = videoModel;

  // ── Persist prompt changes to project settings ─────────────────────
  const onPersistRef = useRef(onPersistPrompts);
  onPersistRef.current = onPersistPrompts;
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!hasInitialized.current) { hasInitialized.current = true; return; }
    if (!onPersistRef.current) return;
    // Convert segment-ID keyed → pair-keyed for storage
    const pairKeyed: Record<string, string> = {};
    for (const seg of segmentsRef.current) {
      if (seg.id in perSegmentPrompts) {
        pairKeyed[`${seg.fromWaypointId}->${seg.toWaypointId}`] = perSegmentPrompts[seg.id];
      }
    }
    onPersistRef.current(pairKeyed, promptMode);
  }, [perSegmentPrompts, promptMode]);

  // When switching to "each" mode, prefill from shared prompt (or existing segment prompt)
  const handlePromptModeChange = useCallback((mode: PromptMode) => {
    if (mode === 'each') {
      const segs = segmentsRef.current;
      const currentPerSeg = perSegRef.current;
      const sharedPrompt = promptRef.current;
      const prefilled: Record<string, string> = {};
      for (const seg of segs) {
        prefilled[seg.id] = currentPerSeg[seg.id] ?? seg.prompt ?? sharedPrompt;
      }
      setPerSegmentPrompts(prefilled);
    }
    setPromptMode(mode);
  }, []);

  // Keep perSegmentPrompts in sync when segments change (new segments get shared prompt)
  const segmentIds = segments.map(s => s.id).join(',');
  useEffect(() => {
    if (promptMode !== 'each') return;
    let changed = false;
    const current = perSegRef.current;
    const updated = { ...current };
    for (const seg of segmentsRef.current) {
      if (!(seg.id in updated)) {
        updated[seg.id] = promptRef.current;
        changed = true;
      }
    }
    if (changed) setPerSegmentPrompts(updated);
  }, [segmentIds, promptMode]);

  // ── Waypoint helpers ────────────────────────────────────────────────
  const waypointMap = useMemo(() => {
    const map = new Map<string, Waypoint>();
    for (const wp of waypoints) map.set(wp.id, wp);
    return map;
  }, [waypoints]);

  const getWaypointLabel = useCallback((waypointId: string): string => {
    const wp = waypointMap.get(waypointId);
    if (!wp) return 'Unknown';
    if (wp.isOriginal) return getOriginalLabel(waypoints, waypointId);
    const az = getAzimuthConfig(wp.azimuth);
    const el = getElevationConfig(wp.elevation);
    return `${az.label} · ${el.label}`;
  }, [waypointMap, waypoints]);

  const getWaypointImage = useCallback((waypointId: string): string | undefined => {
    return waypointMap.get(waypointId)?.imageUrl;
  }, [waypointMap]);

  // ── AI expansion ────────────────────────────────────────────────────
  const [isExpandingAI, setIsExpandingAI] = useState(false);
  const [expandingSegmentId, setExpandingSegmentId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const showAIButton = isFrontendMode();

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Expand the shared prompt using the first segment's images as reference
  const handleExpandAllWithAI = useCallback(async () => {
    const segs = segmentsRef.current;
    if (segs.length === 0) return;
    const seg = segs[0];
    const fromUrl = waypointMap.get(seg.fromWaypointId)?.imageUrl;
    const toUrl = waypointMap.get(seg.toWaypointId)?.imageUrl;
    if (!fromUrl || !toUrl) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsExpandingAI(true);

    try {
      const result = await analyzeTransition({
        fromImageUrl: fromUrl, toImageUrl: toUrl,
        fromLabel: getWaypointLabel(seg.fromWaypointId),
        toLabel: getWaypointLabel(seg.toWaypointId),
        currentPrompt: promptRef.current,
        videoModel: videoModelRef.current,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setTransitionPrompt(result.prompt);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const msg = error instanceof Error ? error.message : 'Prompt expansion failed';
      showToast({ message: `AI expansion failed: ${msg}`, type: 'error' });
    } finally {
      // Always reset loading state — even on abort, so UI doesn't get stuck
      setIsExpandingAI(false);
    }
  }, [waypointMap, getWaypointLabel, showToast]);

  // Expand a single segment's prompt
  const handleExpandSegmentWithAI = useCallback(async (segmentId: string) => {
    const seg = segmentsRef.current.find(s => s.id === segmentId);
    if (!seg) return;
    const fromUrl = waypointMap.get(seg.fromWaypointId)?.imageUrl;
    const toUrl = waypointMap.get(seg.toWaypointId)?.imageUrl;
    if (!fromUrl || !toUrl) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setExpandingSegmentId(segmentId);

    try {
      const currentPrompt = perSegRef.current[segmentId] ?? promptRef.current;
      const result = await analyzeTransition({
        fromImageUrl: fromUrl, toImageUrl: toUrl,
        fromLabel: getWaypointLabel(seg.fromWaypointId),
        toLabel: getWaypointLabel(seg.toWaypointId),
        currentPrompt,
        videoModel: videoModelRef.current,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setSegmentPrompt(segmentId, result.prompt);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const msg = error instanceof Error ? error.message : 'Prompt expansion failed';
      showToast({ message: `AI expansion failed: ${msg}`, type: 'error' });
    } finally {
      // Always reset loading state — even on abort, so UI doesn't get stuck
      setExpandingSegmentId(null);
    }
  }, [waypointMap, getWaypointLabel, setSegmentPrompt, showToast]);

  return {
    promptMode, handlePromptModeChange,
    transitionPrompt, setTransitionPrompt,
    selectedPresetId, handlePresetChange,
    perSegmentPrompts, setSegmentPrompt,
    getWaypointLabel, getWaypointImage,
    isExpandingAI, expandingSegmentId,
    handleExpandAllWithAI, handleExpandSegmentWithAI,
    showAIButton,
  };
}
