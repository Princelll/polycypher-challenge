// ============================================================
// Adaptive Learning G2 — Connection Manager
// Error recovery, reconnection, and state preservation
// ============================================================

import { waitForEvenAppBridge, type EvenAppBridge, type EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { setBridge, getBridge } from './state';
import { showScreen } from './renderer';
import { log } from './log';
import { startKeepAlive, stopKeepAlive } from './keep-alive';

// ── Connection state ──────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'failed';

let connectionStatus: ConnectionStatus = 'disconnected';
let reconnectAttempts = 0;
let eventHandler: ((event: EvenHubEvent) => void) | null = null;
let statusCallback: ((status: ConnectionStatus) => void) | null = null;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]; // exponential backoff

export function getConnectionStatus(): ConnectionStatus {
  return connectionStatus;
}

export function onConnectionStatusChange(cb: (status: ConnectionStatus) => void): void {
  statusCallback = cb;
}

function setStatus(status: ConnectionStatus): void {
  connectionStatus = status;
  statusCallback?.(status);
  log(`Connection: ${status}`);
}

// ── Initial connection ────────────────────────────────────────

export async function connectToGlasses(
  onEvent: (event: EvenHubEvent) => void,
): Promise<EvenAppBridge> {
  eventHandler = onEvent;

  log('Connecting to glasses...');
  const bridge = await waitForEvenAppBridge();
  setBridge(bridge);
  setStatus('connected');
  reconnectAttempts = 0;

  // Register event handler with error wrapping
  bridge.onEvenHubEvent(wrapEventHandler(onEvent));

  // Start keep-alive
  startKeepAlive();

  return bridge;
}

// ── Error-wrapped event handler ───────────────────────────────

function wrapEventHandler(handler: (event: EvenHubEvent) => void) {
  return (event: EvenHubEvent) => {
    try {
      handler(event);
    } catch (err) {
      log(`Event handler error: ${err instanceof Error ? err.message : String(err)}`);
      // Don't crash on individual event errors — log and continue
    }
  };
}

// ── Safe display render with reconnect on failure ─────────────

/**
 * Wraps showScreen() with error handling.
 * If the display call fails (bridge disconnected), triggers reconnection
 * and retries the render once reconnected.
 */
export async function safeShowScreen(): Promise<void> {
  try {
    await showScreen();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Display error: ${msg}`);

    if (isConnectionError(msg)) {
      setStatus('disconnected');
      const recovered = await attemptReconnect();
      if (recovered) {
        // Retry the render after reconnection
        try {
          await showScreen();
        } catch (retryErr) {
          log(`Retry render failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
        }
      }
    }
  }
}

// ── Reconnection logic ────────────────────────────────────────

/**
 * Attempt to reconnect to the glasses bridge with exponential backoff.
 * Preserves current app state so the session can resume.
 */
export async function attemptReconnect(): Promise<boolean> {
  if (connectionStatus === 'reconnecting') return false;
  setStatus('reconnecting');
  stopKeepAlive();

  for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
    reconnectAttempts = attempt + 1;
    const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];

    log(`Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`);
    await sleep(delay);

    try {
      const bridge = await waitForEvenAppBridge();
      setBridge(bridge);

      // Re-register event handler
      if (eventHandler) {
        bridge.onEvenHubEvent(wrapEventHandler(eventHandler));
      }

      setStatus('connected');
      reconnectAttempts = 0;
      startKeepAlive();

      log('Reconnected successfully — resuming session');
      return true;
    } catch (err) {
      log(`Reconnect attempt ${reconnectAttempts} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  setStatus('failed');
  log(`Reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
  return false;
}

// ── Safe bridge call wrapper ──────────────────────────────────

/**
 * Execute a bridge operation with error recovery.
 * If the operation fails due to connection loss, attempt reconnect
 * and retry once.
 */
export async function safeBridgeCall<T>(
  operation: (bridge: EvenAppBridge) => Promise<T>,
): Promise<T | null> {
  try {
    const bridge = getBridge();
    return await operation(bridge);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Bridge call failed: ${msg}`);

    if (isConnectionError(msg)) {
      setStatus('disconnected');
      const recovered = await attemptReconnect();
      if (recovered) {
        try {
          const bridge = getBridge();
          return await operation(bridge);
        } catch (retryErr) {
          log(`Bridge retry failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
        }
      }
    }
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────

function isConnectionError(message: string): boolean {
  const patterns = [
    'bridge not initialized',
    'disconnected',
    'connection lost',
    'not connected',
    'socket closed',
    'ble',
    'bluetooth',
    'network',
    'timeout',
  ];
  const lower = message.toLowerCase();
  return patterns.some(p => lower.includes(p));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
