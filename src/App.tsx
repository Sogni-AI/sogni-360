import React, { useEffect } from 'react';
import Sogni360Container from './components/Sogni360Container';

// Initialize body class for liquid glass state on app load
const initializeLiquidGlassBodyClass = () => {
  try {
    const stored = localStorage.getItem('sogni360_liquid_glass_enabled');
    // Default to enabled (no class) if not set
    if (stored === 'false') {
      document.body.classList.add('no-liquid-glass');
    }
  } catch {
    // Ignore storage errors
  }
};

const App: React.FC = () => {
  // Initialize body class on mount
  useEffect(() => {
    initializeLiquidGlassBodyClass();
  }, []);

  return <Sogni360Container />;
};

export default App;
