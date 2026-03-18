// ============================================================
// Adaptive Learning localStorage Storage Layer
// For Even G2 glasses (no IndexedDB available)
// ============================================================

import {
  Deck,
  CardReviewState,
  ReviewEvent,
  StudySession,
  LearningProfile,
  DailyBiometric,
  Observation,
  createDefaultProfile,
  createDefaultReviewState,
} from './models';

const KEY = 'adaptive_learning_data';

interface StoredData {
  decks: Deck[];
  reviewStates: CardReviewState[];
  reviewEvents: ReviewEvent[];
  sessions: StudySession[];
  profile: LearningProfile | null;
  biometricHistory: DailyBiometric[];
  observations: Observation[];
}

function emptyData(): StoredData {
  return {
    decks: [],
    reviewStates: [],
    reviewEvents: [],
    sessions: [],
    profile: null,
    biometricHistory: [],
    observations: [],
  };
}

export class Storage {
  private data: StoredData;

  constructor() {
    this.data = emptyData();
  }

  async open(): Promise<void> {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        this.data = { ...emptyData(), ...JSON.parse(raw) };
      }
    } catch {
      this.data = emptyData();
    }
  }

  private persist(): void {
    localStorage.setItem(KEY, JSON.stringify(this.data));
  }

  // ── Decks ──────────────────────────────────────────────────

  async saveDeck(deck: Deck): Promise<void> {
    const idx = this.data.decks.findIndex(d => d.id === deck.id);
    if (idx >= 0) this.data.decks[idx] = deck;
    else this.data.decks.push(deck);
    this.persist();
  }

  async getDeck(id: string): Promise<Deck | undefined> {
    return this.data.decks.find(d => d.id === id);
  }

  async getAllDecks(): Promise<Deck[]> {
    return this.data.decks;
  }

  async deleteDeck(id: string): Promise<void> {
    this.data.decks = this.data.decks.filter(d => d.id !== id);
    this.persist();
  }

  // ── Review States ──────────────────────────────────────────

  async saveReviewState(state: CardReviewState): Promise<void> {
    const idx = this.data.reviewStates.findIndex(s => s.cardId === state.cardId);
    if (idx >= 0) this.data.reviewStates[idx] = state;
    else this.data.reviewStates.push(state);
    this.persist();
  }

  async getReviewState(cardId: string): Promise<CardReviewState | undefined> {
    return this.data.reviewStates.find(s => s.cardId === cardId);
  }

  async getReviewStatesForDeck(deckId: string): Promise<CardReviewState[]> {
    return this.data.reviewStates.filter(s => s.deckId === deckId);
  }

  async ensureReviewStates(deck: Deck): Promise<void> {
    for (const card of deck.cards) {
      const existing = await this.getReviewState(card.id);
      if (!existing) {
        await this.saveReviewState(createDefaultReviewState(card.id, deck.id));
      }
    }
  }

  // ── Review Events ──────────────────────────────────────────

  async saveReviewEvent(event: ReviewEvent): Promise<void> {
    this.data.reviewEvents.push(event);
    this.persist();
  }

  async getReviewEventsForSession(sessionId: string): Promise<ReviewEvent[]> {
    return this.data.reviewEvents.filter(e => e.sessionId === sessionId);
  }

  async getReviewEventsForCard(cardId: string): Promise<ReviewEvent[]> {
    return this.data.reviewEvents.filter(e => e.cardId === cardId);
  }

  async getAllReviewEvents(): Promise<ReviewEvent[]> {
    return this.data.reviewEvents;
  }

  // ── Sessions ───────────────────────────────────────────────

  async saveSession(session: StudySession): Promise<void> {
    const idx = this.data.sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) this.data.sessions[idx] = session;
    else this.data.sessions.push(session);
    this.persist();
  }

  async getSession(id: string): Promise<StudySession | undefined> {
    return this.data.sessions.find(s => s.id === id);
  }

  async getAllSessions(): Promise<StudySession[]> {
    return this.data.sessions;
  }

  // ── Profile ────────────────────────────────────────────────

  async getProfile(): Promise<LearningProfile> {
    if (this.data.profile) return this.data.profile;
    const profile = createDefaultProfile();
    this.data.profile = profile;
    this.persist();
    return profile;
  }

  async saveProfile(profile: LearningProfile): Promise<void> {
    this.data.profile = profile;
    this.persist();
  }

  // ── Biometric History ──────────────────────────────────────

  async saveDailyBiometric(entry: DailyBiometric): Promise<void> {
    const idx = this.data.biometricHistory.findIndex(e => e.date === entry.date);
    if (idx >= 0) this.data.biometricHistory[idx] = entry;
    else this.data.biometricHistory.push(entry);
    // Trim to 14
    this.data.biometricHistory.sort((a, b) => a.date.localeCompare(b.date));
    if (this.data.biometricHistory.length > 14) {
      this.data.biometricHistory = this.data.biometricHistory.slice(-14);
    }
    this.persist();
  }

  async getBiometricHistory(): Promise<DailyBiometric[]> {
    return this.data.biometricHistory;
  }

  // ── Observations ───────────────────────────────────────────

  async saveObservation(obs: Observation): Promise<void> {
    this.data.observations.push(obs);
    this.persist();
  }

  async getAllObservations(): Promise<Observation[]> {
    return this.data.observations;
  }

  async getObservationsForCard(cardId: string): Promise<Observation[]> {
    return this.data.observations.filter(o => o.cardId === cardId);
  }
}
