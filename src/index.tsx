import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { AppProvider } from './context/AppContext';
import { ToastProvider } from './context/ToastContext';
import { RewardsProvider } from './context/RewardsContext';
import { initializeGA } from './utils/analytics';
import './styles/index.css';

// Initialize Google Analytics
initializeGA();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <AppProvider>
        <ToastProvider>
          <RewardsProvider>
            <App />
          </RewardsProvider>
        </ToastProvider>
      </AppProvider>
    </HelmetProvider>
  </React.StrictMode>
);
