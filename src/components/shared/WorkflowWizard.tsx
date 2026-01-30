import React, { useState, useEffect } from 'react';

export type WorkflowStep = 'upload' | 'define-angles' | 'render-angles' | 'render-videos' | 'export';

interface WorkflowWizardProps {
  currentStep: WorkflowStep;
  onStepClick?: (step: WorkflowStep) => void;
  completedSteps: WorkflowStep[];
  compact?: boolean;
}

const STEPS: { key: WorkflowStep; label: string; shortLabel: string }[] = [
  { key: 'upload', label: 'Upload', shortLabel: 'Upload' },
  { key: 'define-angles', label: 'Define Angles', shortLabel: 'Define' },
  { key: 'render-angles', label: 'Render Angles', shortLabel: 'Render' },
  { key: 'render-videos', label: 'Render Videos', shortLabel: 'Videos' },
  { key: 'export', label: 'Export', shortLabel: 'Export' }
];

const WorkflowWizard: React.FC<WorkflowWizardProps> = ({
  currentStep,
  onStepClick,
  completedSteps,
  compact = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);

  // Check viewport width for collapsible behavior
  useEffect(() => {
    const checkViewport = () => {
      setIsMobileView(window.innerWidth < 1024);
      // Auto-collapse when returning to larger screens
      if (window.innerWidth >= 1024) {
        setIsExpanded(false);
      }
    };

    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Close expanded view when clicking outside
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.workflow-wizard-expanded-container')) {
        setIsExpanded(false);
      }
    };

    // Delay adding listener to avoid immediate close
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isExpanded]);

  const getStepState = (step: WorkflowStep) => {
    if (completedSteps.includes(step)) return 'complete';
    if (step === currentStep) return 'active';
    return 'upcoming';
  };

  const isClickable = (_step: WorkflowStep) => {
    return onStepClick !== undefined;
  };

  const currentStepIndex = STEPS.findIndex(s => s.key === currentStep);
  const currentStepData = STEPS[currentStepIndex];
  const currentState = getStepState(currentStep);

  const handleStepClick = (step: WorkflowStep) => {
    if (onStepClick) {
      onStepClick(step);
      setIsExpanded(false);
    }
  };

  // Render the full wizard steps
  const renderSteps = () => (
    <>
      {STEPS.map((step, index) => {
        const state = getStepState(step.key);
        const clickable = isClickable(step.key);

        return (
          <div
            key={step.key}
            className={`workflow-wizard-step ${state} ${clickable ? 'clickable' : ''}`}
            onClick={() => clickable && handleStepClick(step.key)}
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
            <span className="workflow-wizard-label">{step.label}</span>
            {index < STEPS.length - 1 && <div className="workflow-wizard-line" />}
          </div>
        );
      })}
    </>
  );

  // On small screens, show collapsible tray
  if (isMobileView && !compact) {
    return (
      <>
        {/* Collapsed tab */}
        {!isExpanded && (
          <button
            className={`workflow-wizard-collapsed-tab ${currentState}`}
            onClick={() => setIsExpanded(true)}
            aria-label="Expand workflow steps"
          >
            <div className={`workflow-wizard-collapsed-dot ${currentState}`}>
              {currentState === 'complete' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span>{currentStepIndex + 1}</span>
              )}
            </div>
            <span className="workflow-wizard-collapsed-text">
              <span className="workflow-wizard-collapsed-prefix">Step {currentStepIndex + 1} of {STEPS.length}</span>
              <span className="workflow-wizard-collapsed-label">
                {currentStepData?.label || 'Step'}
              </span>
            </span>
            <svg className="workflow-wizard-collapsed-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {/* Expanded overlay */}
        {isExpanded && (
          <div className="workflow-wizard-expanded-overlay">
            <div className="workflow-wizard-expanded-container">
              <div className="workflow-wizard-expanded-header">
                <span className="workflow-wizard-expanded-title">Workflow Progress</span>
                <button
                  className="workflow-wizard-expanded-close"
                  onClick={() => setIsExpanded(false)}
                  aria-label="Close workflow panel"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="workflow-wizard workflow-wizard-in-overlay">
                {renderSteps()}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop or compact mode - show full wizard inline
  return (
    <div className={`workflow-wizard ${compact ? 'compact' : ''}`}>
      {STEPS.map((step, index) => {
        const state = getStepState(step.key);
        const clickable = isClickable(step.key);

        return (
          <div
            key={step.key}
            className={`workflow-wizard-step ${state} ${clickable ? 'clickable' : ''}`}
            onClick={() => clickable && handleStepClick(step.key)}
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
