import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook that manages UI visibility based on user activity.
 * UI is shown when user interacts and hidden after a period of inactivity.
 *
 * @param hideDelay - Time in ms before hiding UI after last interaction (default: 3000)
 * @returns boolean - Whether UI should be visible
 */
function useAutoHideUI(hideDelay: number = 3000): boolean {
  const [visible, setVisible] = useState(true);
  const timeoutRef = useRef<number | null>(null);

  const resetTimer = useCallback(() => {
    setVisible(true);

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setVisible(false);
    }, hideDelay);
  }, [hideDelay]);

  useEffect(() => {
    // Events that should reset the hide timer
    const events = ['mousemove', 'touchstart', 'keydown', 'click'];

    // Attach listeners
    for (const event of events) {
      window.addEventListener(event, resetTimer);
    }

    // Start initial timer
    resetTimer();

    // Cleanup
    return () => {
      for (const event of events) {
        window.removeEventListener(event, resetTimer);
      }

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [resetTimer]);

  return visible;
}

export default useAutoHideUI;
