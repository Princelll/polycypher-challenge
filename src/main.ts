// ============================================================
// Adaptive Learning — Even G2 Smart Glasses App
// ML-Driven Biometric-Adaptive Spaced Repetition
// ============================================================

import { initApp } from './g2/app';
import { log } from './g2/log';

// Boot the app when the page loads
async function boot(): Promise<void> {
  const statusEl = document.getElementById('status');

  const connectBtn = document.getElementById('btn-connect');
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      if (statusEl) statusEl.textContent = 'Connecting...';
      try {
        await initApp();
      } catch (err) {
        log(`Boot failed: ${err}`);
        if (statusEl) statusEl.textContent = `Error: ${err}`;
      }
    });
  }

  if (statusEl) statusEl.textContent = 'Click "Connect glasses" to start';
}

boot().catch((err) => {
  console.error('Adaptive Learning boot failed:', err);
});
