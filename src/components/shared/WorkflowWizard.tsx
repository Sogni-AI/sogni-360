import React from 'react';

export type WorkflowStep = 'upload' | 'define-angles' | 'render-angles' | 'render-videos' | 'export';

interface WorkflowWizardProps {
  currentStep: WorkflowStep;
  onStepClick?: (step: WorkflowStep) => void;
  completedSteps: WorkflowStep[];
  compact?: boolean;
}

const STEPS: { key: WorkflowStep; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'define-angles', label: 'Define Angles' },
  { key: 'render-angles', label: 'Render Angles' },
  { key: 'render-videos', label: 'Render Videos' },
  { key: 'export', label: 'Export' }
];

const WorkflowWizard: React.FC<WorkflowWizardProps> = ({
  currentStep,
  onStepClick,
  completedSteps,
  compact = false
}) => {
  const getStepState = (step: WorkflowStep) => {
    if (completedSteps.includes(step)) return 'complete';
    if (step === currentStep) return 'active';
    return 'upcoming';
  };

  const isClickable = (step: WorkflowStep) => {
    // Allow clicking on completed steps or the current step (to re-enter that view)
    return (completedSteps.includes(step) || step === currentStep) && onStepClick;
  };

  return (
    <div className={`workflow-wizard ${compact ? 'compact' : ''}`}>
      {STEPS.map((step, index) => {
        const state = getStepState(step.key);
        const clickable = isClickable(step.key);

        return (
          <div
            key={step.key}
            className={`workflow-wizard-step ${state} ${clickable ? 'clickable' : ''}`}
            onClick={() => clickable && onStepClick?.(step.key)}
          >
            <div className="workflow-wizard-dot">
              {state === 'complete' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span>{index + 1}</span>
              )}
            </div>
            {!compact && <span className="workflow-wizard-label">{step.label}</span>}
            {index < STEPS.length - 1 && <div className="workflow-wizard-line" />}
          </div>
        );
      })}
    </div>
  );
};

export default WorkflowWizard;

/**
 * Helper to compute the current workflow step based on project state
 */
export function computeWorkflowStep(project: {
  sourceImageUrl?: string;
  waypoints: Array<{ status: string; imageUrl?: string }>;
  segments: Array<{ status: string }>;
  status: string;
  finalLoopUrl?: string;
} | null): { currentStep: WorkflowStep; completedSteps: WorkflowStep[] } {
  if (!project || !project.sourceImageUrl) {
    return { currentStep: 'upload', completedSteps: [] };
  }

  const completedSteps: WorkflowStep[] = ['upload'];
  const waypoints = project.waypoints || [];
  const segments = project.segments || [];

  // Check if angles are defined
  if (waypoints.length >= 2) {
    completedSteps.push('define-angles');
  }

  // Check if angles are rendered
  const readyWaypoints = waypoints.filter(wp => wp.status === 'ready' && wp.imageUrl).length;
  const failedWaypoints = waypoints.filter(wp => wp.status === 'failed').length;
  const anglesReady = readyWaypoints >= 2 && failedWaypoints === 0;

  if (anglesReady) {
    completedSteps.push('render-angles');
  }

  // Check if videos are rendered
  const readySegments = segments.filter(s => s.status === 'ready').length;
  const allSegmentsReady = segments.length > 0 && readySegments === segments.length;

  if (allSegmentsReady) {
    completedSteps.push('render-videos');
  }

  // Check if final export is done
  if (project.finalLoopUrl) {
    completedSteps.push('export');
  }

  // Determine current step
  let currentStep: WorkflowStep = 'upload';

  if (project.status === 'generating-angles') {
    currentStep = 'render-angles';
  } else if (project.status === 'generating-transitions') {
    currentStep = 'render-videos';
  } else if (project.finalLoopUrl) {
    currentStep = 'export';
  } else if (allSegmentsReady) {
    currentStep = 'export';
  } else if (anglesReady) {
    currentStep = 'render-videos';
  } else if (waypoints.length >= 2) {
    currentStep = 'render-angles';
  } else if (project.sourceImageUrl) {
    currentStep = 'define-angles';
  }

  return { currentStep, completedSteps };
}
