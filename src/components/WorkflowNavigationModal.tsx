import React, { useState } from 'react';
import type { WorkflowStep } from './shared/WorkflowWizard';
import LiquidGlassPanel from './shared/LiquidGlassPanel';

interface WorkflowNavigationModalProps {
  fromStep: WorkflowStep;
  toStep: WorkflowStep;
  currentProjectName: string;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveCopy: (newName: string) => void;
}

/** Describe what work will be lost when navigating back to a given step */
function getWorkLostDescription(toStep: WorkflowStep): string {
  switch (toStep) {
    case 'upload':
      return 'all generated angles, video transitions, and exported videos';
    case 'define-angles':
      return 'rendered angles, video transitions, and exported videos';
    case 'render-angles':
      return 'video transitions and exported videos';
    case 'render-videos':
      return 'exported videos';
    default:
      return 'subsequent work';
  }
}

const WorkflowNavigationModal: React.FC<WorkflowNavigationModalProps> = ({
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

  const workLost = getWorkLostDescription(toStep);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-5">
      <LiquidGlassPanel
        cornerRadius={24}
        modalTint
        className="glass-modal"
        style={{ width: '100%', maxWidth: '28rem', margin: '0 1rem' }}
      >
        <div
          className="bg-gradient-to-br from-[rgba(17,24,39,0.55)] to-[rgba(3,7,18,0.65)] rounded-[inherit] p-7 w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-xl font-semibold text-white mb-3">
            Save progress first?
          </h2>

          <p className="text-gray-300 mb-4">
            This will discard your {workLost}. You can save a copy of your current project before continuing.
          </p>

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
              className="w-full px-4 py-3 bg-gray-800/80 border border-gray-600/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Enter project name..."
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleSaveCopy}
              disabled={!projectName.trim() || isSaving}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-purple-500/25 min-h-[44px]"
            >
              {isSaving ? 'Saving...' : 'Save Copy & Continue'}
            </button>

            <button
              onClick={onDiscard}
              className="w-full py-3 px-4 bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 text-red-300 font-medium rounded-xl transition-colors min-h-[44px]"
            >
              Continue Without Saving
            </button>

            <button
              onClick={onCancel}
              className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white font-medium rounded-xl transition-all border border-white/10 min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      </LiquidGlassPanel>
    </div>
  );
};

export default WorkflowNavigationModal;
