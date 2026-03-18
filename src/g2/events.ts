// ============================================================
// BioLoop G2 — Event Handling
// Normalizes SDK events and dispatches to app actions
// ============================================================

import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { state, RATING_OPTIONS, BIO_OPTIONS } from './state';
import { showScreen } from './renderer';
import { log } from './log';

// Forward declarations — set by app.ts to avoid circular imports
let startSessionFn: () => Promise<void> = async () => {};
let revealAnswerFn: () => void = () => {};
let rateCardFn: (idx: number) => Promise<void> = async () => {};
let returnToDashboardFn: () => Promise<void> = async () => {};

export function setAppActions(actions: {
  startSession: () => Promise<void>;
  revealAnswer: () => void;
  rateCard: (idx: number) => Promise<void>;
  returnToDashboard: () => Promise<void>;
}): void {
  startSessionFn = actions.startSession;
  revealAnswerFn = actions.revealAnswer;
  rateCardFn = actions.rateCard;
  returnToDashboardFn = actions.returnToDashboard;
}

// ── Event normalization (from weather/pong pattern) ──────────

const SCROLL_COOLDOWN_MS = 300;
let lastScrollTime = 0;

function scrollThrottled(): boolean {
  const now = Date.now();
  if (now - lastScrollTime < SCROLL_COOLDOWN_MS) return true;
  lastScrollTime = now;
  return false;
}

export function resolveEventType(
  event: EvenHubEvent,
): OsEventTypeList | undefined {
  const raw =
    event.listEvent?.eventType ??
    event.textEvent?.eventType ??
    event.sysEvent?.eventType ??
    ((event.jsonData ?? {}) as Record<string, unknown>).eventType ??
    ((event.jsonData ?? {}) as Record<string, unknown>).event_type ??
    ((event.jsonData ?? {}) as Record<string, unknown>).Event_Type ??
    ((event.jsonData ?? {}) as Record<string, unknown>).type;

  if (typeof raw === 'number') {
    switch (raw) {
      case 0: return OsEventTypeList.CLICK_EVENT;
      case 1: return OsEventTypeList.SCROLL_TOP_EVENT;
      case 2: return OsEventTypeList.SCROLL_BOTTOM_EVENT;
      case 3: return OsEventTypeList.DOUBLE_CLICK_EVENT;
      default: return undefined;
    }
  }

  if (typeof raw === 'string') {
    const v = raw.toUpperCase();
    if (v.includes('DOUBLE')) return OsEventTypeList.DOUBLE_CLICK_EVENT;
    if (v.includes('CLICK')) return OsEventTypeList.CLICK_EVENT;
    if (v.includes('SCROLL_TOP') || v.includes('UP'))
      return OsEventTypeList.SCROLL_TOP_EVENT;
    if (v.includes('SCROLL_BOTTOM') || v.includes('DOWN'))
      return OsEventTypeList.SCROLL_BOTTOM_EVENT;
  }

  // SDK normalizes CLICK_EVENT (0) to undefined — treat as click
  if (event.listEvent || event.textEvent || event.sysEvent)
    return OsEventTypeList.CLICK_EVENT;

  return undefined;
}

// ── Main event dispatcher ────────────────────────────────────

export function onEvenHubEvent(event: EvenHubEvent): void {
  const eventType = resolveEventType(event);

  // For rating screen with list, check for list selection
  if (state.screen === 'rating' && event.listEvent) {
    const listIdx = event.listEvent.currentSelectItemIndex ?? 0;
    if (eventType === OsEventTypeList.CLICK_EVENT) {
      log(`Rating selected: ${RATING_OPTIONS[listIdx]}`);
      void rateCardFn(listIdx);
      return;
    }
    // List scrolling is handled natively by firmware
    return;
  }

  log(`Event: type=${String(eventType)} screen=${state.screen}`);

  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
      handleClick();
      break;

    case OsEventTypeList.SCROLL_TOP_EVENT:
      if (!scrollThrottled()) handleScrollUp();
      break;

    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      if (!scrollThrottled()) handleScrollDown();
      break;

    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      // Double-click = back to dashboard from any screen
      void returnToDashboardFn();
      break;
  }
}

// ── Click handler ────────────────────────────────────────────

function handleClick(): void {
  switch (state.screen) {
    case 'dashboard':
      // Start biometric checkin
      state.screen = 'bio_sleep';
      void showScreen();
      break;

    case 'bio_sleep':
      state.screen = 'bio_stress';
      void showScreen();
      break;

    case 'bio_stress':
      state.screen = 'bio_load';
      void showScreen();
      break;

    case 'bio_load':
      state.screen = 'bio_confirm';
      void showScreen();
      break;

    case 'bio_confirm':
      void startSessionFn();
      break;

    case 'question':
      revealAnswerFn();
      break;

    case 'answer':
      state.screen = 'rating';
      state.ratingIdx = 2; // default to 'good'
      void showScreen();
      break;

    case 'summary':
      void returnToDashboardFn();
      break;
  }
}

// ── Scroll handlers (for biometric text screens) ─────────────

function handleScrollUp(): void {
  switch (state.screen) {
    case 'bio_sleep':
      state.bioSleepIdx = Math.max(0, state.bioSleepIdx - 1);
      void showScreen();
      break;
    case 'bio_stress':
      state.bioStressIdx = Math.max(0, state.bioStressIdx - 1);
      void showScreen();
      break;
    case 'bio_load':
      state.bioLoadIdx = Math.max(0, state.bioLoadIdx - 1);
      void showScreen();
      break;
  }
}

function handleScrollDown(): void {
  const max = BIO_OPTIONS.length - 1;
  switch (state.screen) {
    case 'bio_sleep':
      state.bioSleepIdx = Math.min(max, state.bioSleepIdx + 1);
      void showScreen();
      break;
    case 'bio_stress':
      state.bioStressIdx = Math.min(max, state.bioStressIdx + 1);
      void showScreen();
      break;
    case 'bio_load':
      state.bioLoadIdx = Math.min(max, state.bioLoadIdx + 1);
      void showScreen();
      break;
  }
}
