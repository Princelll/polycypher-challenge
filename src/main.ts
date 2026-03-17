// ============================================================
// BioLoop Main Application
// ML-Driven Biometric-Adaptive Spaced Repetition for Frame G2 + R1
// ============================================================

import { Storage } from './core/storage';
import { Scheduler } from './core/scheduler';
import { SessionManager, SessionState, SessionPhase } from './core/session';
import { FrameConnection, ConnectionStatus } from './frame/connection';
import { Analytics, DeckStats, SessionStats } from './core/analytics';
import { createSampleDecks } from './data/sample-decks';
import { Deck, ConfidenceRating, StudySession } from './core/models';
import { renderUI, UICallbacks } from './ui/renderer';

class BioLoopApp {
  private storage: Storage;
  private scheduler: Scheduler;
  private session: SessionManager | null = null;
  private frame: FrameConnection;
  private decks: Deck[] = [];
  private currentDeckId: string | null = null;
  private logs: string[] = [];

  constructor() {
    this.storage = new Storage();
    this.scheduler = new Scheduler();

    this.frame = new FrameConnection({
      onStatusChange: (status) => this.onFrameStatus(status),
      onTap: (rating) => this.onFrameTap(rating),
      onLog: (msg) => this.log(msg),
    });
  }

  async init(): Promise<void> {
    await this.storage.open();
    this.log('Database initialized');

    // Load or create sample decks
    this.decks = await this.storage.getAllDecks();
    if (this.decks.length === 0) {
      this.log('Loading sample decks...');
      const samples = createSampleDecks();
      for (const deck of samples) {
        await this.storage.saveDeck(deck);
      }
      this.decks = samples;
      this.log(`Loaded ${samples.length} sample decks`);
    }

    this.renderApp();
  }

  private log(msg: string): void {
    const time = new Date().toLocaleTimeString();
    this.logs.push(`[${time}] ${msg}`);
    if (this.logs.length > 100) this.logs.shift();
    this.renderApp();
  }

  private onFrameStatus(status: ConnectionStatus): void {
    this.log(`Frame status: ${status}`);
    this.renderApp();
  }

  private onFrameTap(rating: ConfidenceRating): void {
    if (!this.session) return;

    const phase = this.session.getPhase();
    if (phase === 'studying') {
      // Tap during question = reveal answer
      this.session.revealAnswer();
    } else if (phase === 'awaiting-rating') {
      // Tap during answer = rate the card
      this.session.rateCard(rating);
    }
  }

  private async renderApp(): Promise<void> {
    const frameStatus = this.frame.getStatus();
    const sessionPhase = this.session?.getPhase() ?? 'idle';

    // Get analytics for current deck
    let deckStats: DeckStats | null = null;
    let sessionStats: SessionStats | null = null;
    let insights: string[] = [];

    if (this.currentDeckId) {
      const states = await this.storage.getReviewStatesForDeck(this.currentDeckId);
      const deck = this.decks.find(d => d.id === this.currentDeckId);
      if (deck) {
        deckStats = Analytics.computeDeckStats(states, deck.cards.length);
      }
    }

    const allSessions = await this.storage.getAllSessions();
    sessionStats = Analytics.computeSessionStats(allSessions);

    const profile = await this.storage.getProfile();
    if (deckStats && sessionStats) {
      insights = Analytics.generateInsights(profile, sessionStats, deckStats);
    }

    const callbacks: UICallbacks = {
      onConnect: () => this.frame.connect(),
      onDisconnect: () => this.frame.disconnect(),
      onSelectDeck: (deckId) => this.selectDeck(deckId),
      onStartSession: (preState) => this.startSession(preState),
      onRevealAnswer: () => this.session?.revealAnswer(),
      onRateCard: (rating) => this.session?.rateCard(rating),
      onEndSession: () => this.session?.endSession(),
      onImportDeck: (json) => this.importDeck(json),
    };

    renderUI({
      decks: this.decks,
      currentDeckId: this.currentDeckId,
      frameStatus,
      sessionPhase,
      deckStats,
      sessionStats,
      insights,
      logs: this.logs,
      callbacks,
    });
  }

  private selectDeck(deckId: string): void {
    this.currentDeckId = deckId;
    this.log(`Selected deck: ${this.decks.find(d => d.id === deckId)?.name}`);
    this.renderApp();
  }

  private async startSession(preState: 'good' | 'tired' | 'stressed' | null): Promise<void> {
    if (!this.currentDeckId) {
      this.log('Please select a deck first');
      return;
    }

    this.session = new SessionManager(this.scheduler, this.storage, {
      onStateChange: (state) => this.onSessionState(state),
      onSessionEnd: (summary) => this.onSessionEnd(summary),
      onCardDisplay: (text, isFront) => this.onCardDisplay(text, isFront),
      onLog: (msg) => this.log(msg),
    });

    await this.session.startSession(this.currentDeckId, preState);
  }

  private onSessionState(_state: SessionState): void {
    this.renderApp();
  }

  private onSessionEnd(_summary: StudySession): void {
    this.frame.displayFeedback('Session complete!');
    this.renderApp();
  }

  private onCardDisplay(text: string, isFront: boolean): void {
    // Display on Frame glasses if connected
    if (this.frame.isConnected()) {
      this.frame.displayText(text);
    }
    this.renderApp();
  }

  private async importDeck(json: string): Promise<void> {
    try {
      const deck = JSON.parse(json) as Deck;
      if (!deck.id || !deck.cards || !deck.name) {
        this.log('Invalid deck format');
        return;
      }
      await this.storage.saveDeck(deck);
      this.decks = await this.storage.getAllDecks();
      this.log(`Imported deck: ${deck.name} (${deck.cards.length} cards)`);
      this.renderApp();
    } catch (e) {
      this.log(`Import error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// Boot the app
const app = new BioLoopApp();
app.init().catch(err => console.error('BioLoop init failed:', err));
