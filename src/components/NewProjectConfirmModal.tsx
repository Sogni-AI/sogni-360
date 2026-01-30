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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="bg-gray-900 rounded-2xl p-6 max-w-md w-full mx-4 border border-white/10"
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
            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors min-h-[44px]"
          >
            Keep Working
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors min-h-[44px]"
          >
            New Project
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewProjectConfirmModal;
