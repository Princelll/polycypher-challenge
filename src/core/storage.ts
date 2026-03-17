// ============================================================
// BioLoop IndexedDB Storage Layer — v2
// ============================================================

import {
  Card,
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

const DB_NAME = 'bioloop';
const DB_VERSION = 2;

const STORES = {
  decks: 'decks',
  reviewStates: 'reviewStates',
  reviewEvents: 'reviewEvents',
  sessions: 'sessions',
  profile: 'profile',
  biometricHistory: 'biometricHistory',
  observations: 'observations',
} as const;

export class Storage {
  private db: IDBDatabase | null = null;

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

        // v1 stores
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(STORES.decks)) {
            db.createObjectStore(STORES.decks, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORES.reviewStates)) {
            const store = db.createObjectStore(STORES.reviewStates, { keyPath: 'cardId' });
            store.createIndex('deckId', 'deckId', { unique: false });
            store.createIndex('dueDate', 'dueDate', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.reviewEvents)) {
            const store = db.createObjectStore(STORES.reviewEvents, { keyPath: 'id' });
            store.createIndex('cardId', 'cardId', { unique: false });
            store.createIndex('sessionId', 'sessionId', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.sessions)) {
            const store = db.createObjectStore(STORES.sessions, { keyPath: 'id' });
            store.createIndex('deckId', 'deckId', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.profile)) {
            db.createObjectStore(STORES.profile, { keyPath: 'userId' });
          }
        }

        // v2 stores
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(STORES.biometricHistory)) {
            db.createObjectStore(STORES.biometricHistory, { keyPath: 'date' });
          }
          if (!db.objectStoreNames.contains(STORES.observations)) {
            const store = db.createObjectStore(STORES.observations, { keyPath: 'id' });
            store.createIndex('cardId', 'cardId', { unique: false });
            store.createIndex('sessionId', 'sessionId', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  private getStore(name: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error('Database not open');
    return this.db.transaction(name, mode).objectStore(name);
  }

  private request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Decks ──────────────────────────────────────────────────

  async saveDeck(deck: Deck): Promise<void> {
    await this.request(this.getStore(STORES.decks, 'readwrite').put(deck));
  }

  async getDeck(id: string): Promise<Deck | undefined> {
    return this.request(this.getStore(STORES.decks).get(id));
  }

  async getAllDecks(): Promise<Deck[]> {
    return this.request(this.getStore(STORES.decks).getAll());
  }

  async deleteDeck(id: string): Promise<void> {
    await this.request(this.getStore(STORES.decks, 'readwrite').delete(id));
  }

  // ── Review States ──────────────────────────────────────────

  async saveReviewState(state: CardReviewState): Promise<void> {
    await this.request(this.getStore(STORES.reviewStates, 'readwrite').put(state));
  }

  async getReviewState(cardId: string): Promise<CardReviewState | undefined> {
    return this.request(this.getStore(STORES.reviewStates).get(cardId));
  }

  async getReviewStatesForDeck(deckId: string): Promise<CardReviewState[]> {
    return this.request(this.getStore(STORES.reviewStates).index('deckId').getAll(deckId));
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
    await this.request(this.getStore(STORES.reviewEvents, 'readwrite').put(event));
  }

  async getReviewEventsForSession(sessionId: string): Promise<ReviewEvent[]> {
    return this.request(this.getStore(STORES.reviewEvents).index('sessionId').getAll(sessionId));
  }

  async getReviewEventsForCard(cardId: string): Promise<ReviewEvent[]> {
    return this.request(this.getStore(STORES.reviewEvents).index('cardId').getAll(cardId));
  }

  async getAllReviewEvents(): Promise<ReviewEvent[]> {
    return this.request(this.getStore(STORES.reviewEvents).getAll());
  }

  // ── Sessions ───────────────────────────────────────────────

  async saveSession(session: StudySession): Promise<void> {
    await this.request(this.getStore(STORES.sessions, 'readwrite').put(session));
  }

  async getSession(id: string): Promise<StudySession | undefined> {
    return this.request(this.getStore(STORES.sessions).get(id));
  }

  async getAllSessions(): Promise<StudySession[]> {
    return this.request(this.getStore(STORES.sessions).getAll());
  }

  // ── Profile ────────────────────────────────────────────────

  async getProfile(): Promise<LearningProfile> {
    const all = await this.request(this.getStore(STORES.profile).getAll()) as LearningProfile[];
    if (all.length > 0) return all[0];
    const profile = createDefaultProfile();
    await this.saveProfile(profile);
    return profile;
  }

  async saveProfile(profile: LearningProfile): Promise<void> {
    await this.request(this.getStore(STORES.profile, 'readwrite').put(profile));
  }

  // ── Biometric History ──────────────────────────────────────

  /** Save a daily biometric entry and auto-trim to last 14 days */
  async saveDailyBiometric(entry: DailyBiometric): Promise<void> {
    await this.request(this.getStore(STORES.biometricHistory, 'readwrite').put(entry));

    // Trim to 14 most recent entries
    const all = await this.getBiometricHistory();
    if (all.length > 14) {
      const toDelete = all
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, all.length - 14);
      for (const entry of toDelete) {
        await this.request(
          this.getStore(STORES.biometricHistory, 'readwrite').delete(entry.date),
        );
      }
    }
  }

  async getBiometricHistory(): Promise<DailyBiometric[]> {
    return this.request(this.getStore(STORES.biometricHistory).getAll());
  }

  // ── Observations ───────────────────────────────────────────

  async saveObservation(obs: Observation): Promise<void> {
    await this.request(this.getStore(STORES.observations, 'readwrite').put(obs));
  }

  async getAllObservations(): Promise<Observation[]> {
    return this.request(this.getStore(STORES.observations).getAll());
  }

  async getObservationsForCard(cardId: string): Promise<Observation[]> {
    return this.request(this.getStore(STORES.observations).index('cardId').getAll(cardId));
  }

  // ── Card helpers (kept for compatibility) ──────────────────

  void(_card: Card): void { /* type helper */ }
}
