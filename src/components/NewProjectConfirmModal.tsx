import React from 'react';

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
      <div
        className="bg-gradient-to-br from-[rgba(17,24,39,0.98)] to-[rgba(3,7,18,0.98)] rounded-3xl p-7 max-w-md w-full mx-4 border border-white/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-white mb-3">Start New Project?</h2>
        <p className="text-gray-300 mb-4">
          Your current project{projectName ? ` "${projectName}"` : ''} is automatically saved and can be accessed from <span className="text-white font-medium">Projects</span> anytime.
        </p>
        <p className="text-gray-400 text-sm mb-6">
          Ready to start fresh with a new portrait?
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
    </div>
  );
};

export default NewProjectConfirmModal;
