import React, { useEffect, useState, useCallback, useRef } from 'react';
import { listProjects, deleteProject, renameProject, saveProject } from '../utils/localProjectsDB';
import { exportProject, generateExportFilename, downloadZipBlob, ExportOptions } from '../utils/projectExport';
import { importProject, ImportError } from '../utils/projectImport';
import type { LocalProject, Sogni360Project } from '../types';

interface ProjectManagerModalProperties {
  onClose: () => void;
  onLoadProject: (projectId: string) => void;
  onNewProject: () => void;
  onImportProject?: (project: Sogni360Project) => void;
  currentProjectId?: string;
}

const ProjectManagerModal: React.FC<ProjectManagerModalProperties> = ({
  onClose,
  onLoadProject,
  onNewProject,
  onImportProject,
  currentProjectId
}) => {
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  // Export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportDialogProject, setExportDialogProject] = useState<LocalProject | null>(null);
  const [includeVersionHistory, setIncludeVersionHistory] = useState(true);
  const editInputReference = useRef<HTMLInputElement>(null);
  const fileInputReference = useRef<HTMLInputElement>(null);

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

  const handleExportClick = (project: LocalProject, event: React.MouseEvent) => {
    event.stopPropagation();
    if (exportingId) return;

    // Show export dialog
    setExportDialogProject(project);
    setIncludeVersionHistory(true); // Reset to default
    setShowExportDialog(true);
  };

  const handleExportDialogClose = () => {
    setShowExportDialog(false);
    setExportDialogProject(null);
  };

  const handleExportConfirm = async () => {
    if (!exportDialogProject) return;

    setShowExportDialog(false);
    setExportingId(exportDialogProject.id);
    setExportProgress('Preparing export...');

    const exportOptions: ExportOptions = {
      includeVersionHistory
    };

    try {
      const zipBlob = await exportProject(
        exportDialogProject.project,
        (_current, _total, message) => {
          setExportProgress(message);
        },
        exportOptions
      );
      const filename = generateExportFilename(exportDialogProject.name);
      downloadZipBlob(zipBlob, filename);
      setExportProgress('');
    } catch (error) {
      console.error('Failed to export project:', error);
      setExportProgress('Export failed');
      setTimeout(() => setExportProgress(''), 2000);
    } finally {
      setExportingId(null);
      setExportDialogProject(null);
    }
  };

  const handleImportClick = () => {
    setImportError(null);
    fileInputReference.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset the input so the same file can be selected again
    event.target.value = '';

    setImporting(true);
    setImportError(null);
    setImportProgress('Reading file...');

    try {
      const importedProject = await importProject(
        file,
        (_current, _total, message) => {
          setImportProgress(message);
        }
      );

      // Save the imported project to IndexedDB
      await saveProject(importedProject);

      // Refresh the project list
      await loadProjects();

      // Notify parent component if handler provided
      if (onImportProject) {
        onImportProject(importedProject);
      }

      setImportProgress('');
    } catch (error) {
      console.error('Failed to import project:', error);
      if (error instanceof ImportError) {
        setImportError(error.message);
      } else {
        setImportError('Failed to import project');
      }
      setImportProgress('');
    } finally {
      setImporting(false);
    }
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
          <div className="project-manager-header-actions">
            <button
              className="project-import-btn"
              onClick={handleImportClick}
              disabled={importing}
              title="Import project"
            >
              {importing ? (
                <div className="spinner-small" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )}
            </button>
            <button className="project-manager-close" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <input
          ref={fileInputReference}
          type="file"
          accept=".zip,.s360.zip"
          onChange={handleFileSelected}
          style={{ display: 'none' }}
        />

        <div className="project-manager-body">
          <button className="new-project-btn" onClick={onNewProject}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>

          {(importProgress || exportProgress) && (
            <div className="project-manager-progress">
              <div className="spinner-small" />
              <span>{importProgress || exportProgress}</span>
            </div>
          )}

          {importError && (
            <div className="project-manager-error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{importError}</span>
              <button onClick={() => setImportError(null)}>Dismiss</button>
            </div>
          )}

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
                      className="project-export"
                      onClick={event => handleExportClick(project, event)}
                      disabled={exportingId === project.id}
                      title="Export project"
                    >
                      {exportingId === project.id ? (
                        <div className="spinner-small" />
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      )}
                    </button>
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

        {/* Export Dialog */}
        {showExportDialog && exportDialogProject && (
          <div className="export-dialog-overlay" onClick={handleExportDialogClose}>
            <div className="export-dialog" onClick={event => event.stopPropagation()}>
              <div className="export-dialog-header">
                <h3>Export Project</h3>
                <button className="export-dialog-close" onClick={handleExportDialogClose}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="export-dialog-body">
                <p className="export-dialog-description">
                  A zip file will be generated containing all your project data.
                  You can use this file to backup your work or load it back into the app later.
                </p>
                <label className="export-dialog-checkbox">
                  <input
                    type="checkbox"
                    checked={includeVersionHistory}
                    onChange={event => setIncludeVersionHistory(event.target.checked)}
                  />
                  <span className="checkbox-label">Include version history for each image and video segment</span>
                  <span className="checkbox-hint">
                    {includeVersionHistory
                      ? 'All previous versions will be included'
                      : 'Only current versions will be exported (smaller file size)'}
                  </span>
                </label>
              </div>
              <div className="export-dialog-actions">
                <button className="export-dialog-cancel" onClick={handleExportDialogClose}>
                  Cancel
                </button>
                <button className="export-dialog-confirm" onClick={handleExportConfirm}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectManagerModal;
