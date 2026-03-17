// ============================================================
// BioLoop Study Session Manager
// Z-score aware session pipeline with observation recording
// ============================================================

import {
  Card,
  Deck,
  CardReviewState,
  ReviewEvent,
  StudySession,
  LearningProfile,
  BiometricSnapshot,
  BiometricZScores,
  Confounders,
  Observation,
  ConfidenceRating,
  PresentationMode,
  generateId,
} from './models';
import { Scheduler } from './scheduler';
import { Storage } from './storage';
import { runAnalysis, updateStylePreferences } from './regression';

export type SessionPhase =
  | 'idle'
  | 'pre-checkin'
  | 'studying'
  | 'showing-answer'
  | 'awaiting-rating'
  | 'post-checkin'
  | 'complete';

export interface SessionState {
  phase: SessionPhase;
  currentCard: Card | null;
  currentReviewState: CardReviewState | null;
  presentationMode: PresentationMode;
  showingFront: boolean;
  cardsReviewed: number;
  cardsCorrect: number;
  cardsRemaining: number;
  sessionDurationMin: number;
  recentAccuracy: number;
  shouldEndReason: string;
}

export interface SessionEvents {
  onStateChange: (state: SessionState) => void;
  onSessionEnd: (summary: StudySession) => void;
  onCardDisplay: (text: string, isFront: boolean) => void;
  onLog: (message: string) => void;
}

export class SessionManager {
  private scheduler: Scheduler;
  private storage: Storage;
  private events: SessionEvents;

  private session: StudySession | null = null;
  private deck: Deck | null = null;
  private profile: LearningProfile | null = null;
  private dueCards: CardReviewState[] = [];
  private currentCardIndex = 0;
  private phase: SessionPhase = 'idle';
  private currentCard: Card | null = null;
  private currentReviewState: CardReviewState | null = null;
  private currentMode: PresentationMode = 'definition';
  private cardStartTime = 0;
  private recentResults: boolean[] = [];
  private reviewEventIds: string[] = [];
  private sessionStartTime = 0;

  // Z-score context for this session
  private zScores: BiometricZScores | null = null;
  private confounders: Confounders | null = null;

  constructor(scheduler: Scheduler, storage: Storage, events: SessionEvents) {
    this.scheduler = scheduler;
    this.storage = storage;
    this.events = events;
  }

  /**
   * Start a study session.
   * Accepts z-scores and confounders instead of just preState string.
   */
  async startSession(
    deckId: string,
    preState: 'good' | 'tired' | 'stressed' | null,
    zScores: BiometricZScores | null = null,
    confounders: Confounders | null = null,
  ): Promise<void> {
    const deck = await this.storage.getDeck(deckId);
    if (!deck) throw new Error(`Deck not found: ${deckId}`);
    this.deck = deck;

    await this.storage.ensureReviewStates(this.deck);
    this.profile = await this.storage.getProfile();

    this.zScores = zScores;
    this.confounders = confounders ?? this.profile?.confounders ?? null;

    // Session recommendation check
    if (zScores) {
      const rec = this.scheduler.getSessionRecommendation(zScores);
      if (rec.mode === 'stop') {
        this.events.onLog(`Session blocked: ${rec.reason}`);
        this.setPhase('complete');
        return;
      }
      if (rec.mode === 'review_only') {
        this.events.onLog(`Reduced session: ${rec.reason}`);
      }
    }

    const allStates = await this.storage.getReviewStatesForDeck(deckId);
    this.dueCards = this.scheduler.getDueCards(allStates);

    if (this.dueCards.length === 0) {
      this.dueCards = allStates.filter(s => s.totalReviews === 0);
    }

    if (this.dueCards.length === 0) {
      this.events.onLog('No cards due for review!');
      this.setPhase('complete');
      return;
    }

    this.sessionStartTime = Date.now();
    this.currentCardIndex = 0;
    this.recentResults = [];
    this.reviewEventIds = [];

    this.session = {
      id: generateId(),
      deckId,
      startTime: this.sessionStartTime,
      endTime: null,
      cardsReviewed: 0,
      cardsCorrect: 0,
      averageLatencyMs: 0,
      preSessionState: preState,
      postSessionEffort: null,
      biometricSummary: { avgHeartRate: null, avgHrv: null, avgSpo2: null },
      reviewEvents: [],
    };

    await this.storage.saveSession(this.session);
    this.events.onLog(`Session started: ${this.dueCards.length} cards due`);
    this.setPhase('studying');
    await this.showNextCard();
  }

  private async showNextCard(): Promise<void> {
    if (this.currentCardIndex >= this.dueCards.length) {
      await this.endSession();
      return;
    }

    const sessionDuration = (Date.now() - this.sessionStartTime) / 60000;
    const recentAccuracy = this.getRecentAccuracy();
    const check = this.scheduler.shouldEndSession(
      this.session?.cardsReviewed ?? 0,
      sessionDuration,
      recentAccuracy,
      this.profile,
    );

    if (check.shouldEnd) {
      this.events.onLog(`Auto-ending session: ${check.reason}`);
      await this.endSession();
      return;
    }

    const reviewState = this.dueCards[this.currentCardIndex];
    const card = this.deck?.cards.find(c => c.id === reviewState.cardId);
    if (!card) {
      this.currentCardIndex++;
      await this.showNextCard();
      return;
    }

    this.currentCard = card;
    this.currentReviewState = reviewState;

    // Pass z-scores to mode selection for stress-aware logic
    this.currentMode = this.scheduler.selectPresentationMode(
      reviewState,
      this.profile,
      card.complexity,
      this.zScores,
    );

    const frontText = this.getCardText(card, this.currentMode, true);
    this.cardStartTime = Date.now();
    this.setPhase('studying');
    this.events.onCardDisplay(frontText, true);
    this.emitState();
  }

  revealAnswer(): void {
    if (!this.currentCard || this.phase !== 'studying') return;
    const backText = this.getCardText(this.currentCard, this.currentMode, false);
    this.setPhase('awaiting-rating');
    this.events.onCardDisplay(backText, false);
    this.emitState();
  }

  async rateCard(
    rating: ConfidenceRating,
    biometrics: BiometricSnapshot | null = null,
  ): Promise<void> {
    if (!this.currentCard || !this.currentReviewState || !this.session) return;

    const responseLatencyMs = Date.now() - this.cardStartTime;
    const correct = rating === 'good' || rating === 'easy';

    // Attach z-scores to biometric snapshot if we have them
    const enrichedBiometrics: BiometricSnapshot | null = biometrics
      ? { ...biometrics, zScores: this.zScores }
      : this.zScores
        ? {
            timestamp: Date.now(),
            heartRate: null,
            rmssd: null,
            hrv: null,
            spo2: null,
            imu: null,
            selfReportedState: null,
            zScores: this.zScores,
          }
        : null;

    const newState = this.scheduler.schedule(
      this.currentReviewState,
      rating,
      enrichedBiometrics,
      this.profile,
      responseLatencyMs,
    );

    // Mode performance tracking
    if (!newState.modePerformance[this.currentMode]) {
      newState.modePerformance[this.currentMode] = { correct: 0, total: 0 };
    }
    const perf = newState.modePerformance[this.currentMode]!;
    perf.total++;
    if (correct) perf.correct++;

    const bestMode = this.findBestMode(newState);
    if (bestMode) newState.bestPresentationMode = bestMode;

    await this.storage.saveReviewState(newState);

    // Review event
    const event: ReviewEvent = {
      id: generateId(),
      cardId: this.currentCard.id,
      deckId: this.currentCard.deckId,
      timestamp: Date.now(),
      rating,
      responseLatencyMs,
      presentationMode: this.currentMode,
      biometricSnapshot: enrichedBiometrics,
      sessionId: this.session.id,
      correct,
    };
    await this.storage.saveReviewEvent(event);
    this.reviewEventIds.push(event.id);

    // Record observation for OLS regression
    await this.recordObservation(correct, responseLatencyMs, rating);

    // Session stats
    this.session.cardsReviewed++;
    if (correct) this.session.cardsCorrect++;
    this.recentResults.push(correct);
    if (this.recentResults.length > 5) this.recentResults.shift();

    const totalLatency =
      this.session.averageLatencyMs * (this.session.cardsReviewed - 1) + responseLatencyMs;
    this.session.averageLatencyMs = totalLatency / this.session.cardsReviewed;
    this.session.reviewEvents = this.reviewEventIds;
    await this.storage.saveSession(this.session);

    // Update profile + style preferences
    if (this.profile) {
      this.profile = this.scheduler.updateProfile(
        this.profile,
        this.currentMode,
        this.currentCard.complexity,
        correct,
      );
      this.profile.stylePreferences = updateStylePreferences(
        this.profile.stylePreferences,
        this.currentMode,
        correct,
        responseLatencyMs,
      );
      await this.storage.saveProfile(this.profile);
    }

    // Run regression after every 5th observation if we have 15+
    const allObs = await this.storage.getAllObservations();
    if (allObs.length >= 15 && allObs.length % 5 === 0 && this.profile) {
      const result = runAnalysis(allObs);
      this.profile.modelStatus = result.status;
      if (result.recommendations?.bestStyle && this.profile) {
        this.events.onLog(
          `Model updated: R²=${result.r_squared?.toFixed(3) ?? 'N/A'}, best style: ${result.recommendations.bestStyle}`,
        );
      }
      await this.storage.saveProfile(this.profile);
    }

    if (!correct) {
      this.dueCards.push(newState);
    }

    this.currentCardIndex++;
    this.events.onLog(
      `Card rated: ${rating} (${correct ? 'correct' : 'incorrect'}) — next review in ${newState.interval} day(s)`,
    );

    await this.showNextCard();
  }

  async endSession(postEffort: 'easy' | 'moderate' | 'hard' | null = null): Promise<void> {
    if (!this.session) return;

    this.session.endTime = Date.now();
    this.session.postSessionEffort = postEffort;
    await this.storage.saveSession(this.session);

    if (this.profile) {
      this.profile.totalSessions++;
      this.profile.totalCards += this.session.cardsReviewed;
      await this.storage.saveProfile(this.profile);
    }

    this.events.onSessionEnd(this.session);
    this.events.onLog(
      `Session complete: ${this.session.cardsReviewed} cards, ${this.session.cardsCorrect} correct (${Math.round((this.session.cardsCorrect / Math.max(1, this.session.cardsReviewed)) * 100)}%)`,
    );

    this.setPhase('complete');
    this.emitState();
  }

  // ── Private helpers ────────────────────────────────────────

  private async recordObservation(
    correct: boolean,
    latencyMs: number,
    rating: ConfidenceRating,
  ): Promise<void> {
    if (!this.currentCard || !this.session || !this.profile) return;

    const sessionDurationMin = (Date.now() - this.sessionStartTime) / 60000;
    const hour = new Date().getHours();
    let timeOfDay: Observation['features']['timeOfDay'] = 'morning';
    if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
    else if (hour >= 21 || hour < 5) timeOfDay = 'night';

    const obs: Observation = {
      id: generateId(),
      timestamp: Date.now(),
      cardId: this.currentCard.id,
      sessionId: this.session.id,
      features: {
        explanationStyle: this.currentMode,
        stressLevel: this.zScores?.stressState ?? 0.5,
        energyLevel: this.zScores ? 1 - this.zScores.cognitiveLoad : 0.5,
        timeOfDay,
        topicPosition: this.currentCardIndex,
        minutesIntoSession: sessionDurationMin,
        daysSinceLastStudy: this.currentReviewState?.lastReview
          ? (Date.now() - this.currentReviewState.lastReview) / 86400000
          : 0,
        priorLevel: this.currentReviewState?.easeFactor ?? 2.5,
        complexity: this.currentCard.complexity,
        course: this.currentCard.deckId,
      },
      confounders: this.confounders ?? {
        onSSRI: false,
        bmiCategory: 'normal',
        smoker: false,
      },
      outcomes: {
        masteryGain: rating === 'easy' ? 1 : rating === 'good' ? 0.5 : 0,
        quickfireCorrect: correct && latencyMs < 5000,
        elaborated: false,
        madeOwnConnection: false,
        neededReexplanation: rating === 'again',
        recalledCorrectly: correct,
        latencyMs,
      },
    };

    await this.storage.saveObservation(obs);
  }

  private getCardText(card: Card, mode: PresentationMode, isFront: boolean): string {
    if (mode !== 'definition' && card.presentations?.[mode]) {
      return isFront ? card.presentations[mode]!.front : card.presentations[mode]!.back;
    }
    return isFront ? card.front : card.back;
  }

  private findBestMode(state: CardReviewState): PresentationMode | null {
    let bestMode: PresentationMode | null = null;
    let bestRate = 0;
    for (const [mode, perf] of Object.entries(state.modePerformance)) {
      if (perf && perf.total >= 3) {
        const rate = perf.correct / perf.total;
        if (rate > bestRate) {
          bestRate = rate;
          bestMode = mode as PresentationMode;
        }
      }
    }
    return bestMode;
  }

  private getRecentAccuracy(): number {
    if (this.recentResults.length === 0) return 1;
    return this.recentResults.filter(r => r).length / this.recentResults.length;
  }

  private setPhase(phase: SessionPhase) {
    this.phase = phase;
  }

  private emitState() {
    const sessionDuration = (Date.now() - this.sessionStartTime) / 60000;
    this.events.onStateChange({
      phase: this.phase,
      currentCard: this.currentCard,
      currentReviewState: this.currentReviewState,
      presentationMode: this.currentMode,
      showingFront: this.phase === 'studying',
      cardsReviewed: this.session?.cardsReviewed ?? 0,
      cardsCorrect: this.session?.cardsCorrect ?? 0,
      cardsRemaining: Math.max(0, this.dueCards.length - this.currentCardIndex),
      sessionDurationMin: sessionDuration,
      recentAccuracy: this.getRecentAccuracy(),
      shouldEndReason: '',
    });
  }

  getPhase(): SessionPhase {
    return this.phase;
  }
}
