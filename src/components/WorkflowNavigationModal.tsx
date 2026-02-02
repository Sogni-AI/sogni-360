import React, { useState } from 'react';
import type { WorkflowStep } from './shared/WorkflowWizard';

interface WorkflowNavigationModalProps {
  fromStep: WorkflowStep;
  toStep: WorkflowStep;
  currentProjectName: string;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveCopy: (newName: string) => void;
}

const STEP_LABELS: Record<WorkflowStep, string> = {
  'upload': 'Upload',
  'define-angles': 'Define Angles',
  'render-angles': 'Render Angles',
  'render-videos': 'Render Videos',
  'export': 'Export'
};

const WorkflowNavigationModal: React.FC<WorkflowNavigationModalProps> = ({
  fromStep,
  toStep,
  currentProjectName,
  onCancel,
  onDiscard,
  onSaveCopy
}) => {
  const [projectName, setProjectName] = useState(`${currentProjectName} (copy)`);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveCopy = async () => {
    if (!projectName.trim()) return;
    setIsSaving(true);
    await onSaveCopy(projectName.trim());
    setIsSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && projectName.trim()) {
      handleSaveCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-[rgba(17,24,39,0.98)] to-[rgba(3,7,18,0.98)] rounded-2xl border border-white/10 w-full max-w-md mx-4 p-6 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
        <h2 className="text-xl font-semibold text-white mb-4">
          Go back to {STEP_LABELS[toStep]}?
        </h2>

        <p className="text-gray-300 mb-4">
          Going from <strong className="text-white">{STEP_LABELS[fromStep]}</strong> back to{' '}
          <strong className="text-white">{STEP_LABELS[toStep]}</strong> will discard any work
          after that point.
        </p>

        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 mb-6">
          <p className="text-yellow-200 text-sm">
            We will automatically save a copy of your current project to make this new change so you can go back to the old version if needed.
          </p>
        </div>

        <div className="mb-6">
          <label htmlFor="project-name" className="block text-sm font-medium text-gray-300 mb-2">
            Save current progress as:
          </label>
          <input
            id="project-name"
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Enter project name..."
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleSaveCopy}
            disabled={!projectName.trim() || isSaving}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save Copy & Continue'}
          </button>

          <button
            onClick={onDiscard}
            className="w-full py-3 px-4 bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 text-red-300 font-medium rounded-lg transition-colors"
          >
            Discard & Go Back
          </button>

          <button
            onClick={onCancel}
            className="w-full py-3 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowNavigationModal;
