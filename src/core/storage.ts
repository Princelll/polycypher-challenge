// ============================================================
// BioLoop IndexedDB Storage Layer
// ============================================================

import {
  Card,
  Deck,
  CardReviewState,
  ReviewEvent,
  StudySession,
  LearningProfile,
  createDefaultProfile,
  createDefaultReviewState,
} from './models';

const DB_NAME = 'bioloop';
const DB_VERSION = 1;

const STORES = {
  decks: 'decks',
  reviewStates: 'reviewStates',
  reviewEvents: 'reviewEvents',
  sessions: 'sessions',
  profile: 'profile',
} as const;

export class Storage {
  private db: IDBDatabase | null = null;

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
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

  // --- Decks ---

  async saveDeck(deck: Deck): Promise<void> {
    const store = this.getStore(STORES.decks, 'readwrite');
    await this.request(store.put(deck));
  }

  async getDeck(id: string): Promise<Deck | undefined> {
    const store = this.getStore(STORES.decks);
    return this.request(store.get(id));
  }

  async getAllDecks(): Promise<Deck[]> {
    const store = this.getStore(STORES.decks);
    return this.request(store.getAll());
  }

  async deleteDeck(id: string): Promise<void> {
    const store = this.getStore(STORES.decks, 'readwrite');
    await this.request(store.delete(id));
  }

  // --- Review States ---

  async saveReviewState(state: CardReviewState): Promise<void> {
    const store = this.getStore(STORES.reviewStates, 'readwrite');
    await this.request(store.put(state));
  }

  async getReviewState(cardId: string): Promise<CardReviewState | undefined> {
    const store = this.getStore(STORES.reviewStates);
    return this.request(store.get(cardId));
  }

  async getReviewStatesForDeck(deckId: string): Promise<CardReviewState[]> {
    const store = this.getStore(STORES.reviewStates);
    const index = store.index('deckId');
    return this.request(index.getAll(deckId));
  }

  async ensureReviewStates(deck: Deck): Promise<void> {
    for (const card of deck.cards) {
      const existing = await this.getReviewState(card.id);
      if (!existing) {
        await this.saveReviewState(createDefaultReviewState(card.id, deck.id));
      }
    }
  }

  // --- Review Events ---

  async saveReviewEvent(event: ReviewEvent): Promise<void> {
    const store = this.getStore(STORES.reviewEvents, 'readwrite');
    await this.request(store.put(event));
  }

  async getReviewEventsForSession(sessionId: string): Promise<ReviewEvent[]> {
    const store = this.getStore(STORES.reviewEvents);
    const index = store.index('sessionId');
    return this.request(index.getAll(sessionId));
  }

  async getReviewEventsForCard(cardId: string): Promise<ReviewEvent[]> {
    const store = this.getStore(STORES.reviewEvents);
    const index = store.index('cardId');
    return this.request(index.getAll(cardId));
  }

  async getAllReviewEvents(): Promise<ReviewEvent[]> {
    const store = this.getStore(STORES.reviewEvents);
    return this.request(store.getAll());
  }

  // --- Sessions ---

  async saveSession(session: StudySession): Promise<void> {
    const store = this.getStore(STORES.sessions, 'readwrite');
    await this.request(store.put(session));
  }

  async getSession(id: string): Promise<StudySession | undefined> {
    const store = this.getStore(STORES.sessions);
    return this.request(store.get(id));
  }

  async getAllSessions(): Promise<StudySession[]> {
    const store = this.getStore(STORES.sessions);
    return this.request(store.getAll());
  }

  // --- Profile ---

  async getProfile(): Promise<LearningProfile> {
    const store = this.getStore(STORES.profile);
    const all = await this.request(store.getAll()) as LearningProfile[];
    if (all.length > 0) return all[0];
    // Create default profile
    const profile = createDefaultProfile();
    await this.saveProfile(profile);
    return profile;
  }

  async saveProfile(profile: LearningProfile): Promise<void> {
    const store = this.getStore(STORES.profile, 'readwrite');
    await this.request(store.put(profile));
  }
}
