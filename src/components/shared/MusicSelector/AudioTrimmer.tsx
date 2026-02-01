import React, { useRef, useEffect, useCallback, useState } from 'react';
import { formatAudioTime } from '../../../utils/audioUtils';

interface AudioTrimmerProps {
  audioUrl: string;
  waveform: number[];
  audioDuration: number;
  videoDuration: number;
  startOffset: number;
  selectedDuration: number;
  onStartOffsetChange: (offset: number) => void;
  onSelectedDurationChange: (duration: number) => void;
  /** When true, selection duration is fixed and user can only move it (not resize) */
  fixedDuration?: boolean;
}

const CANVAS_WIDTH = 352;
const CANVAS_HEIGHT = 60;
const MIN_DURATION = 0.25;
const DURATION_STEP = 0.25;

const AudioTrimmer: React.FC<AudioTrimmerProps> = ({
  audioUrl,
  waveform,
  audioDuration,
  videoDuration,
  startOffset,
  selectedDuration,
  onStartOffsetChange,
  onSelectedDurationChange,
  fixedDuration = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);
  const startOffsetRef = useRef(startOffset);
  const selectedDurationRef = useRef(selectedDuration);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'start' | 'end' | 'move' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);
  const [dragStartDuration, setDragStartDuration] = useState(0);

  // Keep refs in sync
  useEffect(() => {
    startOffsetRef.current = startOffset;
    selectedDurationRef.current = selectedDuration;
  }, [startOffset, selectedDuration]);

  // Draw waveform
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveform.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const barWidth = width / waveform.length;

    ctx.clearRect(0, 0, width, height);

    // Draw waveform bars
    waveform.forEach((value, i) => {
      const barHeight = Math.max(2, value * (height - 8));
      const x = i * barWidth;
      const y = (height - barHeight) / 2;

      const barTime = (i / waveform.length) * audioDuration;
      const isInSelection = barTime >= startOffset && barTime < startOffset + selectedDuration;

      ctx.fillStyle = isInSelection ? '#ffffff' : 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(x + 0.5, y, barWidth - 1, barHeight);
    });

    // Draw selection border
    if (audioDuration > 0) {
      const startX = (startOffset / audioDuration) * width;
      const selectionWidth = (selectedDuration / audioDuration) * width;

      ctx.strokeStyle = 'rgba(236, 72, 153, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(startX + 1, 1, selectionWidth - 2, height - 2);

      // Draw drag handles only when duration is adjustable
      if (!fixedDuration) {
        ctx.fillStyle = 'rgba(236, 72, 153, 1)';
        ctx.fillRect(startX, 0, 4, height);
        ctx.fillRect(startX + selectionWidth - 4, 0, 4, height);
      }
    }

    // Draw playhead if playing
    if (isPlaying) {
      const playheadX = (playhead / audioDuration) * width;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
  }, [waveform, audioDuration, startOffset, selectedDuration, isPlaying, playhead, fixedDuration]);

  // Redraw on changes
  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  // Get client X from mouse or touch event
  const getClientX = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): number => {
    if ('touches' in e) {
      return e.touches[0]?.clientX ?? 0;
    }
    return (e as MouseEvent).clientX;
  };

  // Prevent context menu on long press (mobile)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Handle mouse/touch down on canvas
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    // Prevent default to stop long-press actions on mobile
    e.preventDefault();
    e.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas || audioDuration === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = getClientX(e) - rect.left;
    const clickPosition = Math.max(0, Math.min(1, x / rect.width));
    const clickTime = clickPosition * audioDuration;

    // Calculate handle zones (10px on each side)
    const handleZone = (10 / rect.width) * audioDuration;
    const selectionStart = startOffset;
    const selectionEnd = startOffset + selectedDuration;

    let detectedType: 'start' | 'end' | 'move' | null = null;

    // When fixedDuration is true, only allow moving (no resizing)
    if (fixedDuration) {
      if (clickTime >= selectionStart && clickTime <= selectionEnd) {
        detectedType = 'move';
      }
    } else if (Math.abs(clickTime - selectionStart) < handleZone) {
      detectedType = 'start';
    } else if (Math.abs(clickTime - selectionEnd) < handleZone) {
      detectedType = 'end';
    } else if (clickTime >= selectionStart && clickTime <= selectionEnd) {
      detectedType = 'move';
    }

    if (!detectedType) {
      // Clicked outside - jump selection to that position
      const maxOffset = Math.max(0, audioDuration - selectedDuration);
      const newOffset = Math.max(0, Math.min(clickTime - selectedDuration / 2, maxOffset));
      onStartOffsetChange(Math.round(newOffset / DURATION_STEP) * DURATION_STEP);
      return;
    }

    setIsDragging(true);
    setDragType(detectedType);
    setDragStartX(getClientX(e));
    setDragStartOffset(startOffset);
    setDragStartDuration(selectedDuration);

    // Pause playback during drag
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    }
  };

  // Handle mouse/touch move
  useEffect(() => {
    if (!isDragging || !dragType) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const deltaX = getClientX(e) - dragStartX;
      const deltaTime = (deltaX / rect.width) * audioDuration;

      if (dragType === 'move') {
        const maxOffset = Math.max(0, audioDuration - selectedDuration);
        let newOffset = dragStartOffset + deltaTime;
        newOffset = Math.max(0, Math.min(newOffset, maxOffset));
        newOffset = Math.round(newOffset / DURATION_STEP) * DURATION_STEP;
        onStartOffsetChange(newOffset);
      } else if (dragType === 'start') {
        let newOffset = dragStartOffset + deltaTime;
        let newDuration = dragStartDuration - deltaTime;

        newOffset = Math.max(0, newOffset);
        newDuration = Math.max(MIN_DURATION, newDuration);

        if (newOffset + newDuration > audioDuration) {
          newDuration = audioDuration - newOffset;
        }

        newOffset = Math.round(newOffset / DURATION_STEP) * DURATION_STEP;
        newDuration = Math.round(newDuration / DURATION_STEP) * DURATION_STEP;

        onStartOffsetChange(newOffset);
        onSelectedDurationChange(newDuration);
      } else if (dragType === 'end') {
        let newDuration = dragStartDuration + deltaTime;
        newDuration = Math.max(MIN_DURATION, newDuration);
        newDuration = Math.min(audioDuration - startOffset, newDuration);
        newDuration = Math.round(newDuration / DURATION_STEP) * DURATION_STEP;
        onSelectedDurationChange(newDuration);
      }
    };

    const handleUp = () => {
      setIsDragging(false);
      setDragType(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, dragType, dragStartX, dragStartOffset, dragStartDuration, audioDuration, startOffset, selectedDuration, onStartOffsetChange, onSelectedDurationChange]);

  // Play/pause toggle
  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      setIsPlaying(false);
    } else {
      audio.currentTime = startOffset;
      audio.play().catch(() => {});
      setIsPlaying(true);

      // Animation loop for playhead
      const animate = () => {
        if (!audioRef.current) return;

        const currentTime = audioRef.current.currentTime;
        setPlayhead(currentTime);

        // Loop at selection end
        const endTime = startOffsetRef.current + selectedDurationRef.current;
        if (currentTime >= endTime) {
          audioRef.current.currentTime = startOffsetRef.current;
        }

        animationRef.current = requestAnimationFrame(animate);
      };
      animate();
    }
  };

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Stop playback when audio URL changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      setPlayhead(0);
    }
  }, [audioUrl]);

  return (
    <div className="audio-trimmer">
      <audio ref={audioRef} src={audioUrl} preload="auto" />

      {/* Waveform canvas */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px'
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          onContextMenu={handleContextMenu}
          style={{
            width: '100%',
            height: '60px',
            cursor: isDragging ? 'grabbing' : (fixedDuration ? 'grab' : 'pointer'),
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none'
          }}
        />

        {/* Duration labels */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '8px',
          fontSize: '12px',
          color: 'rgba(255, 255, 255, 0.6)'
        }}>
          <span>{formatAudioTime(startOffset)}</span>
          <span style={{ color: 'rgba(236, 72, 153, 1)', fontWeight: 600 }}>
            {formatAudioTime(selectedDuration)} selected
          </span>
          <span>{formatAudioTime(audioDuration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px'
      }}>
        <button
          onClick={handlePlayPause}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: '2px solid rgba(255, 255, 255, 0.8)',
            background: isPlaying ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
            color: isPlaying ? 'rgba(236, 72, 153, 1)' : 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            transition: 'all 0.2s ease'
          }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
      </div>

      {/* Video duration info */}
      {videoDuration > 0 && (
        <p style={{
          marginTop: '12px',
          fontSize: '12px',
          color: 'rgba(255, 255, 255, 0.6)',
          textAlign: 'center'
        }}>
          Video duration: {formatAudioTime(videoDuration)}
          {selectedDuration < videoDuration && (
            <span style={{ color: '#fbbf24' }}>
              {' '}(audio will loop)
            </span>
          )}
        </p>
      )}
    </div>
  );
};

export default AudioTrimmer;
