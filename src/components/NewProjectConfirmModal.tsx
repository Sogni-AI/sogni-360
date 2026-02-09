import React from 'react';
import { LiquidGlassPanel } from './shared/LiquidGlassPanel';

interface NewProjectConfirmModalProps {
  projectName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const NewProjectConfirmModal: React.FC<NewProjectConfirmModalProps> = ({
  projectName,
  onConfirm,
  onCancel
}) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-5">
      <LiquidGlassPanel
        cornerRadius={24}
        modalTint
        style={{ width: '100%', maxWidth: '28rem', margin: '0 1rem' }}
      >
      <div
        className="bg-gradient-to-br from-[rgba(17,24,39,0.55)] to-[rgba(3,7,18,0.65)] rounded-[inherit] p-7 w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-white mb-3">Create New Project?</h2>
        <p className="text-gray-300 mb-4">
          Your current project{projectName ? ` "${projectName}"` : ''} is automatically saved and can be accessed from <span className="text-white font-medium">Projects</span> anytime.
        </p>
        <p className="text-gray-400 text-sm mb-6">
          Ready to start fresh with a new project?
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white font-medium transition-all min-h-[44px] border border-white/10"
          >
            Keep Working
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium transition-all min-h-[44px] shadow-lg shadow-purple-500/25"
          >
            New Project
          </button>
        </div>
      </div>
      </LiquidGlassPanel>
    </div>
  );
};

export default NewProjectConfirmModal;
