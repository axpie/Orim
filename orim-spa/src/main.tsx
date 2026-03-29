import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './i18n';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';

// Hydrate persisted state before first render
useAuthStore.getState().hydrate();
useThemeStore.getState().hydrate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
