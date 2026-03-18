// ============================================================
// BioLoop G2 — Main App Logic
// Connects SDK bridge, storage, session manager, and renderer
// ============================================================

import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { state, setBridge, getBridge, buildZScores, RATING_OPTIONS } from './state';
import { showScreen } from './renderer';
import { onEvenHubEvent, setAppActions } from './events';
import { log } from './log';
import { Storage } from '../core/storage';
import { Scheduler } from '../core/scheduler';
import { SessionManager, SessionEvents } from '../core/session';
import { createSampleDecks } from '../data/sample-decks';
import type { ConfidenceRating, StudySession } from '../core/models';

let storage: Storage;
let scheduler: Scheduler;
let sessionManager: SessionManager | null = null;
let currentDeckId: string | null = null;

// ── Session event callbacks ──────────────────────────────────

const sessionEvents: SessionEvents = {
  onStateChange: (sessionState) => {
    state.cardNumber = sessionState.cardsReviewed + 1;
    state.cardsCorrect = sessionState.cardsCorrect;
    state.totalCards = sessionState.cardsRemaining + sessionState.cardsReviewed;
    updateBrowserStatus();
  },

  onSessionEnd: (session: StudySession) => {
    const pct = session.cardsReviewed > 0
      ? Math.round((session.cardsCorrect / session.cardsReviewed) * 100)
      : 0;
    state.summaryText = [
      `Cards: ${session.cardsReviewed}`,
      `Correct: ${session.cardsCorrect} (${pct}%)`,
      `Avg time: ${(session.averageLatencyMs / 1000).toFixed(1)}s`,
    ].join('\n');
    state.screen = 'summary';
    void showScreen();
  },

  onCardDisplay: (text: string, isFront: boolean) => {
    if (isFront) {
      state.questionText = text;
      state.screen = 'question';
    } else {
      state.answerText = text;
      state.screen = 'answer';
    }
    void showScreen();
  },

  onLog: (msg: string) => {
    log(msg);
  },
};

// ── App actions (called by events.ts) ────────────────────────

async function startSession(): Promise<void> {
  if (!currentDeckId || !sessionManager) {
    log('No deck loaded');
    return;
  }

  const zScores = buildZScores();
  const profile = await storage.getProfile();

  log(`Starting session: sleep=${state.bioSleepIdx} stress=${state.bioStressIdx} load=${state.bioLoadIdx}`);

  try {
    await sessionManager.startSession(
      currentDeckId,
      null,
      zScores,
      profile.confounders,
    );
  } catch (err) {
    log(`Session error: ${err}`);
    state.screen = 'dashboard';
    void showScreen();
  }
}

function revealAnswer(): void {
  if (!sessionManager) return;
  sessionManager.revealAnswer();
}

async function rateCard(idx: number): Promise<void> {
  if (!sessionManager) return;
  const rating = RATING_OPTIONS[idx] as ConfidenceRating;
  log(`Rating: ${rating}`);
  await sessionManager.rateCard(rating, null);
}

async function returnToDashboard(): Promise<void> {
  await refreshDashboard();
  state.screen = state.deckNames.length > 0 ? 'welcome' : 'no_decks';
  void showScreen();
}

async function selectDeck(idx: number): Promise<void> {
  if (idx < 0 || idx >= state.deckIds.length) return;
  currentDeckId = state.deckIds[idx];
  state.deckName = state.deckNames[idx];

  // Refresh due count for the selected deck
  const reviewStates = await storage.getReviewStatesForDeck(currentDeckId);
  const now = Date.now();
  state.cardsDue = reviewStates.filter(s => s.dueDate <= now).length;
  if (state.cardsDue === 0) {
    state.cardsDue = reviewStates.filter(s => s.totalReviews === 0).length;
  }

  log(`Selected deck: ${state.deckName} (${state.cardsDue} due)`);

  // Go straight to bio checkin for this deck
  state.screen = 'bio_sleep';
  void showScreen();
}

async function startPlannedStudy(): Promise<void> {
  await refreshDashboard();
  if (state.deckNames.length === 0) {
    state.screen = 'no_decks';
    void showScreen();
    return;
  }
  // Go to bio checkin with the default (first) deck
  state.screen = 'bio_sleep';
  void showScreen();
}

// ── Dashboard data refresh ───────────────────────────────────

async function refreshDashboard(): Promise<void> {
  const decks = await storage.getAllDecks();

  // Update deck lists for selection screen
  state.deckNames = decks.map(d => d.name);
  state.deckIds = decks.map(d => d.id);
  state.deckSelectIdx = 0;

  if (decks.length > 0) {
    const deck = decks[0];
    currentDeckId = deck.id;
    state.deckName = deck.name;

    const reviewStates = await storage.getReviewStatesForDeck(deck.id);
    const now = Date.now();
    state.cardsDue = reviewStates.filter(s => s.dueDate <= now).length;
    if (state.cardsDue === 0) {
      state.cardsDue = reviewStates.filter(s => s.totalReviews === 0).length;
    }
  }

  const profile = await storage.getProfile();
  state.modelStatus = profile.modelStatus;

  const obs = await storage.getAllObservations();
  state.obsCount = obs.length;
}

// ── Browser status panel ─────────────────────────────────────

function updateBrowserStatus(): void {
  const el = document.getElementById('status');
  if (el) {
    el.textContent = `Screen: ${state.screen} | Cards: ${state.cardNumber}/${state.totalCards} | Correct: ${state.cardsCorrect}`;
  }
}

// ── Initialization ───────────────────────────────────────────

export async function initApp(): Promise<void> {
  log('Initializing BioLoop...');

  // Open storage and load/create sample decks
  storage = new Storage();
  await storage.open();

  const existingDecks = await storage.getAllDecks();
  if (existingDecks.length === 0) {
    log('Loading sample decks...');
    const decks = createSampleDecks();
    for (const deck of decks) {
      await storage.saveDeck(deck);
      await storage.ensureReviewStates(deck);
    }
    log(`Loaded ${decks.length} decks`);
  }

  // Init scheduler + session manager
  scheduler = new Scheduler();
  sessionManager = new SessionManager(scheduler, storage, sessionEvents);

  // Wire up event actions
  setAppActions({
    startSession,
    revealAnswer,
    rateCard,
    returnToDashboard,
    selectDeck,
    startPlannedStudy,
  });

  // Connect to glasses bridge
  log('Waiting for glasses bridge...');
  const bridge = await waitForEvenAppBridge();
  setBridge(bridge);
  log('Bridge connected');

  // Register event handler
  bridge.onEvenHubEvent(onEvenHubEvent);
  log('Event handler registered');

  // Load deck list for selection screen and dashboard data
  await refreshDashboard();
  const allDecks = await storage.getAllDecks();
  state.deckNames = allDecks.map(d => d.name);
  state.deckIds = allDecks.map(d => d.id);

  // Start on welcome or no_decks screen
  state.screen = state.deckNames.length > 0 ? 'welcome' : 'no_decks';
  await showScreen();

  log('StudyHub ready');
  updateBrowserStatus();
}
