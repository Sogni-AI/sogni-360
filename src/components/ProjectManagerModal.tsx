import React, { useEffect, useState, useCallback } from 'react';
import { listProjects, deleteProject } from '../utils/localProjectsDB';
import type { LocalProject } from '../types';

interface ProjectManagerModalProps {
  onClose: () => void;
  onLoadProject: (projectId: string) => void;
  onNewProject: () => void;
  currentProjectId?: string;
}

const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  onClose,
  onLoadProject,
  onNewProject,
  currentProjectId
}) => {
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const projectList = await listProjects();
      setProjects(projectList);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId) return;

    setDeletingId(projectId);
    try {
      await deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="project-manager-overlay" onClick={onClose}>
      <div className="project-manager-modal" onClick={e => e.stopPropagation()}>
        <div className="project-manager-header">
          <div className="project-manager-title-group">
            <h2 className="project-manager-title">My Projects</h2>
            <p className="project-manager-subtitle">
              {projects.length} saved project{projects.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button className="project-manager-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="project-manager-body">
          <button className="new-project-btn" onClick={onNewProject}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>

          {loading ? (
            <div className="project-manager-loading">
              <div className="spinner" />
              <span>Loading projects...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="project-manager-empty">
              <div className="empty-icon">📁</div>
              <p>No saved projects yet</p>
              <span>Upload an image to get started</span>
            </div>
          ) : (
            <div className="project-list">
              {projects.map(project => (
                <div
                  key={project.id}
                  className={`project-card ${project.id === currentProjectId ? 'current' : ''}`}
                  onClick={() => onLoadProject(project.id)}
                >
                  <div className="project-thumbnail">
                    {project.thumbnailUrl ? (
                      <img src={project.thumbnailUrl} alt={project.name} />
                    ) : (
                      <div className="thumbnail-placeholder">📷</div>
                    )}
                    {project.id === currentProjectId && (
                      <div className="current-badge">Current</div>
                    )}
                  </div>
                  <div className="project-info">
                    <div className="project-name">{project.name}</div>
                    <div className="project-meta">
                      <span>{formatDate(project.updatedAt)}</span>
                      <span className="meta-separator">•</span>
                      <span>{formatTime(project.updatedAt)}</span>
                    </div>
                    <div className="project-stats">
                      <span>{project.project.waypoints.length} angles</span>
                      {project.project.segments.length > 0 && (
                        <>
                          <span className="meta-separator">•</span>
                          <span>{project.project.segments.length} videos</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    className="project-delete"
                    onClick={(e) => handleDeleteProject(project.id, e)}
                    disabled={deletingId === project.id}
                    title="Delete project"
                  >
                    {deletingId === project.id ? (
                      <div className="spinner-small" />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectManagerModal;
