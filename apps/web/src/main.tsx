import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { initAuth, clearToken } from './lib/auth';
import './index.css';

const APP_NAME = 'ONYX POS';

initAuth();

// Listen for auth expiry → return to login screen
window.addEventListener('auth:logout', () => {
  clearToken();
  const current = window.location.pathname;
  if (!current.startsWith('/login')) {
    window.location.href = `${import.meta.env.BASE_URL}login`;
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: false,
    },
  },
});

function hideSplash() {
  const splash = document.getElementById('onyx-splash');
  if (!splash) return;
  splash.style.opacity = '0';
  splash.style.pointerEvents = 'none';
  window.setTimeout(() => {
    splash.style.display = 'none';
  }, 500);
}

// Register a PWA install prompt handler (fires "BeforeInstallPrompt" if supported)
if ('installPrompt' in window.navigator) {
  try {
    const ip = (navigator as { installPrompt?: { register: () => void } }).installPrompt;
    ip?.register();
  } catch {
    // Install prompt API not available
  }
}

// Notify the OS Shell-integrated PWA that the app is ready
if ('onshell' in window && document.readyState === 'complete') {
  const shell = (window as { onshell?: { setReady: (v: boolean) => Promise<void> } }).onshell;
  try {
    shell?.setReady(true);
  } catch {
    // ignore
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

// No flash: keep splash visible until the app is mounted, then fade it out.
window.setTimeout(hideSplash, 650);
document.addEventListener('DOMContentLoaded', () => void 0);
window.addEventListener('load', () => void 0);
