// ============================================================
// BioLoop G2 — Keep-Alive Heartbeat
// Prevents SDK/webview suspension during idle periods
// Pattern from even-toolkit keep-alive module
// ============================================================

import { getBridge } from './state';
import { log } from './log';

const HEARTBEAT_INTERVAL_MS = 30_000; // 30s heartbeat
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts a periodic heartbeat that sends a minimal page rebuild
 * to keep the BLE connection and webview alive.
 * The even-toolkit uses a similar pattern to prevent the SDK
 * from going idle and dropping the connection.
 */
export function startKeepAlive(): void {
  if (heartbeatTimer) return; // already running

  heartbeatTimer = setInterval(() => {
    try {
      const bridge = getBridge();
      // Send a no-op event to keep the connection alive
      // The bridge ping keeps BLE and webview active
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (bridge as any).getEvenHubInfo?.();
    } catch {
      // Bridge not ready yet — ignore
    }
  }, HEARTBEAT_INTERVAL_MS);

  log('Keep-alive heartbeat started');
}

/**
 * Stops the keep-alive heartbeat.
 * Call this when disconnecting or cleaning up.
 */
export function stopKeepAlive(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    log('Keep-alive heartbeat stopped');
  }
}
