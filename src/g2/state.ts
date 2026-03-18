// ============================================================
// Adaptive Learning G2 — Application State
// ============================================================

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { ConfidenceRating, BiometricZScores } from '../core/models';

/** All screens the glasses can show */
export type Screen =
  | 'welcome'
  | 'no_decks'
  | 'deck_select'
  | 'dashboard'
  | 'bio_sleep'
  | 'bio_stress'
  | 'bio_load'
  | 'bio_confirm'
  | 'question'
  | 'answer'
  | 'rating'
  | 'summary';

/** Biometric self-report options */
export const BIO_OPTIONS = ['poor', 'fair', 'good', 'great'] as const;
export type BioLevel = typeof BIO_OPTIONS[number];

/** Map BioLevel to a 0-1 float */
export function bioLevelToFloat(level: BioLevel): number {
  switch (level) {
    case 'poor': return 0.1;
    case 'fair': return 0.4;
    case 'good': return 0.7;
    case 'great': return 0.95;
  }
}

/** Rating options for the list */
export const RATING_OPTIONS: ConfidenceRating[] = ['again', 'hard', 'good', 'easy'];

export interface AppState {
  screen: Screen;
  startupRendered: boolean;

  // Biometric self-report
  bioSleepIdx: number;
  bioStressIdx: number;
  bioLoadIdx: number;

  // Session
  questionText: string;
  answerText: string;
  cardNumber: number;
  totalCards: number;
  cardsCorrect: number;
  ratingIdx: number;

  // Summary
  summaryText: string;

  // Dashboard
  deckName: string;
  cardsDue: number;
  modelStatus: string;
  obsCount: number;

  // Deck selection
  deckNames: string[];
  deckIds: string[];
  deckSelectIdx: number;
}

export const state: AppState = {
  screen: 'welcome',
  startupRendered: false,

  bioSleepIdx: 2,
  bioStressIdx: 2,
  bioLoadIdx: 1,

  questionText: '',
  answerText: '',
  cardNumber: 0,
  totalCards: 0,
  cardsCorrect: 0,
  ratingIdx: 2,

  summaryText: '',

  deckName: '',
  cardsDue: 0,
  modelStatus: 'collecting_data',
  obsCount: 0,

  deckNames: [],
  deckIds: [],
  deckSelectIdx: 0,
};

/** Build z-scores from self-reported biometric levels */
export function buildZScores(): BiometricZScores {
  return {
    rmssdZ: 0,
    spo2DipZ: 0,
    restingHRZ: 0,
    sleepQuality: bioLevelToFloat(BIO_OPTIONS[state.bioSleepIdx]),
    stressState: 1 - bioLevelToFloat(BIO_OPTIONS[state.bioStressIdx]),
    cognitiveLoad: 1 - bioLevelToFloat(BIO_OPTIONS[state.bioLoadIdx]),
  };
}

// Bridge reference — set once at init
let _bridge: EvenAppBridge | null = null;

export function setBridge(b: EvenAppBridge): void {
  _bridge = b;
}

export function getBridge(): EvenAppBridge {
  if (!_bridge) throw new Error('Bridge not initialized');
  return _bridge;
}
