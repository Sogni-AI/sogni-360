import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DEMO_VIDEOS } from '../constants/demoVideos';

/**
 * DemoVideoBackground - Displays demo videos in a 6-tile grid pattern
 *
 * Creates a consistent grid layout that showcases all 6 demo videos
 * with good visibility while keeping the main UI readable.
 */
const DemoVideoBackground: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check viewport size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fade in after mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (DEMO_VIDEOS.length === 0) return null;

  // Use all 6 videos
  const videos = DEMO_VIDEOS.slice(0, 6);

  return (
    <div
      className="demo-video-background"
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      <div className={`demo-video-grid ${isMobile ? 'mobile' : 'desktop'}`}>
        {videos.map((video, index) => (
          <VideoTile key={video.id} video={video} index={index} />
        ))}
      </div>
      {/* Gradient overlay for center focus - keeps UI readable */}
      <div className="demo-video-overlay" />
    </div>
  );
};

/**
 * Individual video tile component
 */
interface VideoTileProps {
  video: { id: string; url: string; title: string };
  index: number;
}

const VideoTile: React.FC<VideoTileProps> = React.memo(({ video, index }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Stagger playback start for visual interest
    const playTimer = setTimeout(() => {
      videoElement.play().catch(() => {
        // Autoplay may be blocked - that's OK
      });
    }, index * 300);

    return () => clearTimeout(playTimer);
  }, [index]);

  const handleLoadedData = useCallback(() => {
    setIsLoaded(true);
  }, []);

  return (
    <div
      className="demo-video-tile"
      style={{ opacity: isLoaded ? 1 : 0 }}
    >
      <video
        ref={videoRef}
        src={video.url}
        muted
        loop
        playsInline
        preload="metadata"
        onLoadedData={handleLoadedData}
      />
    </div>
  );
});

VideoTile.displayName = 'VideoTile';

export default DemoVideoBackground;
