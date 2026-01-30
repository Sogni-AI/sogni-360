import React, { useEffect, useState, useCallback, useRef } from 'react';
import { listProjects, deleteProject, renameProject } from '../utils/localProjectsDB';
import type { LocalProject } from '../types';

interface ProjectManagerModalProperties {
  onClose: () => void;
  onLoadProject: (projectId: string) => void;
  onNewProject: () => void;
  currentProjectId?: string;
}

const ProjectManagerModal: React.FC<ProjectManagerModalProperties> = ({
  onClose,
  onLoadProject,
  onNewProject,
  currentProjectId
}) => {
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const editInputReference = useRef<HTMLInputElement>(null);

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

  const handleDeleteProject = async (projectId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (deletingId) return;

    setDeletingId(projectId);
    try {
      await deleteProject(projectId);
      setProjects(previous => previous.filter(p => p.id !== projectId));
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const startEditing = (project: LocalProject, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingId(project.id);
    setEditingName(project.name);
  };

  useEffect(() => {
    if (editingId && editInputReference.current) {
      editInputReference.current.focus();
      editInputReference.current.select();
    }
  }, [editingId]);

  const saveRename = async () => {
    if (!editingId || !editingName.trim()) {
      setEditingId(null);
      return;
    }

    try {
      await renameProject(editingId, editingName.trim());
      setProjects(previous => previous.map(p =>
        p.id === editingId
          ? { ...p, name: editingName.trim(), project: { ...p.project, name: editingName.trim() } }
          : p
      ));
    } catch (error) {
      console.error('Failed to rename project:', error);
    } finally {
      setEditingId(null);
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleEditKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
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
      <div className="project-manager-modal" onClick={event => event.stopPropagation()}>
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
                    {editingId === project.id ? (
                      <input
                        ref={editInputReference}
                        type="text"
                        className="project-name-input"
                        value={editingName}
                        onChange={event => setEditingName(event.target.value)}
                        onBlur={saveRename}
                        onKeyDown={handleEditKeyDown}
                        onClick={event => event.stopPropagation()}
                      />
                    ) : (
                      <div className="project-name">{project.name}</div>
                    )}
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
                  <div className="project-actions">
                    <button
                      className="project-edit"
                      onClick={event => startEditing(project, event)}
                      disabled={editingId === project.id}
                      title="Rename project"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      className="project-delete"
                      onClick={event => handleDeleteProject(project.id, event)}
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
