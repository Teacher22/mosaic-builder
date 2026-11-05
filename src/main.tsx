import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './ui/App.tsx';
import { registerOfflineSupport } from './ui/offline';
import { deleteLegacyCache } from './store/cache';

deleteLegacyCache();
registerOfflineSupport();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
