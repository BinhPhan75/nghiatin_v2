import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log("[Main] React bootstrapping started...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("[Main] Root element #root not found!");
} else {
  console.log("[Main] Mounting React app to #root");
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

