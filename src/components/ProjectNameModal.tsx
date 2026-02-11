import React, { useState, useEffect, useRef } from 'react';
import LiquidGlassPanel from './shared/LiquidGlassPanel';

interface ProjectNameModalProps {
  suggestedName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

const ProjectNameModal: React.FC<ProjectNameModalProps> = ({
  suggestedName,
  onConfirm,
  onCancel
}) => {
  const [name, setName] = useState(suggestedName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus and select the input on mount
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) {
      onConfirm(trimmedName);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/15 p-5">
      <LiquidGlassPanel
        cornerRadius={24}
        modalTint
        className="glass-modal"
        displacementScale={60}
        saturation={160}
        aberrationIntensity={4}
        style={{ maxWidth: '28rem', width: '100%', margin: '0 1rem' }}
      >
      <div
        className="p-7 rounded-[inherit]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="text-xl font-semibold text-white mb-2">Name Your Project</h2>
        <p className="text-gray-300 text-sm mb-4">
          Give your 360 portrait a memorable name
        </p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter project name..."
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-base"
            maxLength={100}
          />

          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-medium transition-all min-h-[44px] border border-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-all min-h-[44px] shadow-lg shadow-purple-500/25"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
      </LiquidGlassPanel>
    </div>
  );
};

export default ProjectNameModal;

/**
 * Generate a clever suggested project name based on context
 */
export function generateProjectName(projectCount: number): string {
  const now = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[now.getMonth()];
  const day = now.getDate();

  // Get time of day for creative naming
  const hour = now.getHours();
  let timeOfDay = '';
  if (hour >= 5 && hour < 12) {
    timeOfDay = 'Morning';
  } else if (hour >= 12 && hour < 17) {
    timeOfDay = 'Afternoon';
  } else if (hour >= 17 && hour < 21) {
    timeOfDay = 'Evening';
  } else {
    timeOfDay = 'Night';
  }

  // Creative name variations
  const variations = [
    `360 Portrait - ${month} ${day}`,
    `${timeOfDay} Portrait - ${month} ${day}`,
    `Portrait Session ${projectCount + 1}`,
    `Orbital Portrait - ${month} ${day}`,
    `360 Spin - ${month} ${day}`,
  ];

  // Pick a variation based on project count to keep it interesting
  return variations[projectCount % variations.length];
}
