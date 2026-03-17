// ============================================================
// BioLoop Main Application
// ML-Driven Biometric-Adaptive Spaced Repetition
// ============================================================

import { Storage } from './core/storage';
import { Scheduler } from './core/scheduler';
import { SessionManager, SessionState, SessionPhase } from './core/session';
import { FrameConnection, ConnectionStatus } from './frame/connection';
import { Analytics, DeckStats, SessionStats } from './core/analytics';
import { createSampleDecks } from './data/sample-decks';
import {
  Deck,
  ConfidenceRating,
  StudySession,
  BiometricZScores,
  Confounders,
  CalibrationStatus,
  SessionRecommendation,
  ModelDashboard,
} from './core/models';
import { renderUI, UICallbacks } from './ui/renderer';
import { runAnalysis } from './core/regression';

class BioLoopApp {
  private storage: Storage;
  private scheduler: Scheduler;
  private session: SessionManager | null = null;
  private frame: FrameConnection;
  private decks: Deck[] = [];
  private currentDeckId: string | null = null;
  private logs: string[] = [];

  // Z-score state
  private currentZScores: BiometricZScores = {
    rmssdZ: 0,
    spo2DipZ: 0,
    restingHRZ: 0,
    sleepQuality: 0.7,
    stressState: 0.3,
    cognitiveLoad: 0.3,
  };
  private currentConfounders: Confounders = {
    onSSRI: false,
    bmiCategory: 'normal',
    smoker: false,
  };

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

    this.decks = await this.storage.getAllDecks();
    if (this.decks.length === 0) {
      const samples = createSampleDecks();
      for (const deck of samples) {
        await this.storage.saveDeck(deck);
      }
      this.decks = samples;
      this.log(`Loaded ${samples.length} sample decks`);
    }

    // Load saved confounders from profile
    const profile = await this.storage.getProfile();
    if (profile.confounders) {
      this.currentConfounders = profile.confounders;
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
      this.session.revealAnswer();
    } else if (phase === 'awaiting-rating') {
      this.session.rateCard(rating);
    }
  }

  private async renderApp(): Promise<void> {
    const frameStatus = this.frame.getStatus();
    const sessionPhase = (this.session?.getPhase() ?? 'idle') as SessionPhase;

    let deckStats: DeckStats | null = null;
    let sessionStats: SessionStats | null = null;
    let insights: string[] = [];
    let calibrationStatus: CalibrationStatus | null = null;
    let sessionRecommendation: SessionRecommendation | null = null;
    let modelDashboard: ModelDashboard | null = null;

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

    // Calibration status
    calibrationStatus = this.scheduler.calibrationStatus(profile.biometricHistory);

    // Session recommendation from current z-scores
    sessionRecommendation = this.scheduler.getSessionRecommendation(this.currentZScores);

    // Model dashboard
    const allObs = await this.storage.getAllObservations();
    if (allObs.length > 0) {
      modelDashboard = Analytics.getModelDashboard(profile, allObs);
    }

    if (deckStats && sessionStats) {
      insights = Analytics.generateInsights(profile, sessionStats, deckStats, modelDashboard);
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
      onZScoreChange: (z) => this.onZScoreChange(z),
      onConfounderChange: (c) => this.onConfounderChange(c),
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
      currentZScores: this.currentZScores,
      currentConfounders: this.currentConfounders,
      calibrationStatus,
      sessionRecommendation,
      modelDashboard,
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
      onStateChange: (_state: SessionState) => this.renderApp(),
      onSessionEnd: (_summary: StudySession) => {
        this.frame.displayFeedback('Session complete!');
        this.renderApp();
      },
      onCardDisplay: (text: string, _isFront: boolean) => {
        if (this.frame.isConnected()) {
          this.frame.displayText(text);
        }
        this.renderApp();
      },
      onLog: (msg: string) => this.log(msg),
    });

    await this.session.startSession(
      this.currentDeckId,
      preState,
      this.currentZScores,
      this.currentConfounders,
    );
  }

  private async onZScoreChange(z: BiometricZScores): Promise<void> {
    this.currentZScores = z;
    // Update session recommendation reactively (no full re-render to keep slider focus)
    const rec = this.scheduler.getSessionRecommendation(z);
    const recEl = document.querySelector('.rec-banner');
    if (rec.mode !== 'normal') {
      const cls = rec.mode === 'stop' ? 'rec-banner rec-stop' : 'rec-banner rec-review';
      const icon = rec.mode === 'stop' ? '🛑' : '⚠️';
      const html = `${icon} ${rec.reason ?? ''} ${rec.mode === 'review_only' ? `<span class="rec-cards">(${rec.cards} cards max)</span>` : ''}`;
      if (recEl) {
        recEl.className = cls;
        recEl.innerHTML = html;
      } else {
        // Insert after calibration banner if present
        const banner = document.querySelector('.calibration-banner');
        if (banner) {
          const div = document.createElement('div');
          div.className = cls;
          div.innerHTML = html;
          banner.insertAdjacentElement('afterend', div);
        }
      }
    } else if (recEl) {
      recEl.remove();
    }
  }

  private async onConfounderChange(c: Confounders): Promise<void> {
    this.currentConfounders = c;
    // Persist to profile
    const profile = await this.storage.getProfile();
    profile.confounders = c;
    await this.storage.saveProfile(profile);
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

  /** Run a one-off regression check (can be called from console) */
  async runModelCheck(): Promise<void> {
    const obs = await this.storage.getAllObservations();
    const result = runAnalysis(obs);
    this.log(`Model check: ${result.status} — ${result.message ?? ''}`);
    if (result.recommendations) {
      this.log(`Best style: ${result.recommendations.bestStyle}`);
    }
  }
}

// Boot
const app = new BioLoopApp();
app.init().catch(err => console.error('BioLoop init failed:', err));

// Expose for console debugging
(window as unknown as Record<string, unknown>).bioloop = app;
