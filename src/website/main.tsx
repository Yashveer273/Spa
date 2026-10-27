import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Site-wide styles (page-specific styles are imported by each page)
import '../styles/style.css';
import '../styles/header.css';
import '../styles/protect.css';
import { protectContent } from './lib/protect';

// Discourage copying photos and text (customer website only – not the admin)
protectContent();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
