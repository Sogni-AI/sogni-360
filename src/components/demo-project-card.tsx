/**
 * Demo Project Card
 *
 * Displays a demo project in the project list with lazy-load capability.
 * Shows download progress when user clicks to load the demo.
 */

import React, { useState } from 'react';
import {
  DEMO_PROJECTS,
  isDemoDownloaded,
  formatFileSize,
  type DemoProjectManifest
} from '../constants/demo-projects';
import { loadDemoProject, DemoLoadError } from '../utils/demo-project-loader';
import { saveProject } from '../utils/localProjectsDB';
import type { Sogni360Project } from '../types';

interface DemoProjectCardProperties {
  demo: DemoProjectManifest;
  onDemoLoaded: (project: Sogni360Project) => void;
  disabled?: boolean;
}

const DemoProjectCard: React.FC<DemoProjectCardProperties> = ({
  demo,
  onDemoLoaded,
  disabled
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [thumbnailError, setThumbnailError] = useState(false);

  const clearError = () => setError('');

  const isDownloaded = isDemoDownloaded(demo.id);

  const handleClick = async () => {
    if (isLoading || disabled) return;

    setIsLoading(true);
    clearError();
    setProgress('Starting download...');

    try {
      const project = await loadDemoProject(demo, (_current, _total, message) => {
        setProgress(message);
      });

      // Save to IndexedDB
      await saveProject(project);

      // Notify parent
      onDemoLoaded(project);
    } catch (error_) {
      console.error('Failed to load demo:', error_);
      if (error_ instanceof DemoLoadError) {
        setError(error_.message);
      } else {
        setError('Failed to load demo project');
      }
    } finally {
      setIsLoading(false);
      setProgress('');
    }
  };

  return (
    <div
      className={`project-card demo-card ${isLoading ? 'loading' : ''}`}
      onClick={handleClick}
    >
      <div className="project-thumbnail">
        {thumbnailError ? (
          <div className="thumbnail-placeholder">🎬</div>
        ) : (
          <img
            src={demo.thumbnailUrl}
            alt={demo.name}
            onError={() => setThumbnailError(true)}
          />
        )}
        <div className="demo-badge">Demo</div>
      </div>
      <div className="project-info">
        <div className="project-name">{demo.name}</div>
        <div className="project-meta">
          <span>{demo.description}</span>
        </div>
        <div className="project-stats">
          <span>{demo.waypointCount} angles</span>
          <span className="meta-separator">•</span>
          <span>{demo.segmentCount} videos</span>
          {!isDownloaded && (
            <>
              <span className="meta-separator">•</span>
              <span className="demo-size">{formatFileSize(demo.zipSizeBytes)}</span>
            </>
          )}
        </div>
        {isLoading && (
          <div className="demo-progress">
            <div className="spinner-small" />
            <span>{progress}</span>
          </div>
        )}
        {error && (
          <div className="demo-error">
            <span>{error}</span>
            <button onClick={(event_) => { event_.stopPropagation(); clearError(); }}>
              Retry
            </button>
          </div>
        )}
      </div>
      <div className="project-actions">
        {isLoading ? (
          <div className="spinner-small" />
        ) : (
          <button
            className="demo-open-btn"
            title={isDownloaded ? 'Open demo' : 'Download and open demo'}
            disabled={disabled}
          >
            {isDownloaded ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

interface DemoProjectsSectionProperties {
  onDemoLoaded: (project: Sogni360Project) => void;
  disabled?: boolean;
}

export const DemoProjectsSection: React.FC<DemoProjectsSectionProperties> = ({
  onDemoLoaded,
  disabled
}) => {
  // Only show demos that are configured
  if (DEMO_PROJECTS.length === 0) {
    return;
  }

  return (
    <div className="demo-projects-section">
      <div className="demo-section-header">
        <span className="demo-section-title">Demo Projects</span>
        <span className="demo-section-subtitle">
          Try these pre-built examples
        </span>
      </div>
      <div className="demo-projects-list">
        {DEMO_PROJECTS.map(demo => (
          <DemoProjectCard
            key={demo.id}
            demo={demo}
            onDemoLoaded={onDemoLoaded}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
};

export default DemoProjectCard;
