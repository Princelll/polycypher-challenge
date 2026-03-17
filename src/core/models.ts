// ============================================================
// BioLoop Data Models
// ============================================================

/** Card presentation modes - different ways to display the same content */
export type PresentationMode =
  | 'definition'
  | 'analogy'
  | 'example'
  | 'visual'
  | 'socratic'
  | 'mnemonic'
  | 'step-by-step'
  | 'contrast'
  | 'real_life_example'
  | 'clinical_example'
  | 'story';

// ── Z-Score Biometric Model (Cheng 2022, Schiweck 2018) ────────

/** Biometric z-scores relative to personal baseline */
export interface BiometricZScores {
  /** RMSSD z-score — parasympathetic index. Negative = below personal baseline */
  rmssdZ: number;
  /** SpO2 nocturnal dip severity z-score. Positive = worse than usual dipping */
  spo2DipZ: number;
  /** Resting HR z-score. Positive = elevated above personal baseline */
  restingHRZ: number;
  /** Self-reported sleep quality 0-1 (0=poor, 1=excellent) */
  sleepQuality: number;
  /** Self-reported stress state 0-1 (0=low, 1=extreme) */
  stressState: number;
  /** Self-reported cognitive load 0-1 (0=low, 1=high) */
  cognitiveLoad: number;
}

/** Structural confounders — collected once, affect HRV baseline (Licht 2008) */
export interface Confounders {
  /** SSRIs structurally reduce HRV by ~10-15ms RMSSD */
  onSSRI: boolean;
  /** BMI category — obesity associated with lower HRV */
  bmiCategory: 'underweight' | 'normal' | 'overweight' | 'obese';
  /** Smoking reduces HRV structurally */
  smoker: boolean;
}

/** One day of biometric readings for personal baseline calculation */
export interface DailyBiometric {
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** RMSSD in ms */
  rmssd: number;
  /** Resting heart rate in bpm */
  restingHR: number;
  /** SpO2 nocturnal dip severity score 0-1 */
  spo2Dip: number;
}

/** Session recommendation from biometric analysis */
export interface SessionRecommendation {
  mode: 'normal' | 'review_only' | 'stop';
  cards: number;
  reason: string | null;
}

/** Calibration status for personal baseline */
export interface CalibrationStatus {
  calibrated: boolean;
  daysRemaining: number;
  totalDays: number;
  message: string;
}

/** Single observation for OLS regression training */
export interface Observation {
  id: string;
  timestamp: number;
  cardId: string;
  sessionId: string;
  features: {
    explanationStyle: string;
    stressLevel: number;
    energyLevel: number;
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    topicPosition: number;
    minutesIntoSession: number;
    daysSinceLastStudy: number;
    priorLevel: number;
    complexity: string;
    course: string;
  };
  confounders: Confounders;
  outcomes: {
    masteryGain: number;
    quickfireCorrect: boolean;
    elaborated: boolean;
    madeOwnConnection: boolean;
    neededReexplanation: boolean;
    recalledCorrectly: boolean;
    latencyMs: number;
  };
}

/** OLS regression analysis result */
export interface RegressionResult {
  status: 'collecting_data' | 'initial_model' | 'refined' | 'mature' | 'error';
  observationsNeeded?: number;
  r_squared?: number;
  adjusted_r_squared?: number;
  n_observations?: number;
  coefficients?: Record<string, {
    beta: number;
    std_error: number;
    t_stat: number;
    p_value: number;
    significant: boolean;
    isConfounder?: boolean;
  }>;
  recommendations?: {
    bestStyle: string;
    styleRanking: { style: string; beta: number; significant: boolean }[];
  };
  message?: string;
}

/** Confidence rating from user input (tap gestures on Frame) */
export type ConfidenceRating = 'again' | 'hard' | 'good' | 'easy';

/** Maps to SM-2 quality scores */
export const CONFIDENCE_QUALITY: Record<ConfidenceRating, number> = {
  again: 0,
  hard: 2,
  good: 4,
  easy: 5,
};

/** Subject complexity tags */
export type ComplexityTag = 'vocabulary' | 'concept' | 'procedure' | 'application' | 'analysis';

/** A single flashcard */
export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  /** Alternative presentation formats */
  presentations?: Partial<Record<PresentationMode, { front: string; back: string }>>;
  complexity: ComplexityTag;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

/** A deck of flashcards */
export interface Deck {
  id: string;
  name: string;
  description: string;
  cards: Card[];
  createdAt: number;
  updatedAt: number;
}

/** SM-2+ review state for a single card */
export interface CardReviewState {
  cardId: string;
  deckId: string;
  /** Number of consecutive correct reviews */
  repetitions: number;
  /** Easiness factor (SM-2), starts at 2.5 */
  easeFactor: number;
  /** Current interval in days */
  interval: number;
  /** Next review timestamp */
  dueDate: number;
  /** Last review timestamp */
  lastReview: number | null;
  /** Total reviews count */
  totalReviews: number;
  /** Consecutive correct count */
  streak: number;
  /** Best presentation mode discovered for this card */
  bestPresentationMode: PresentationMode | null;
  /** Performance per presentation mode: mode -> { correct, total } */
  modePerformance: Partial<Record<PresentationMode, { correct: number; total: number }>>;
}

/** A single review event (for analytics) */
export interface ReviewEvent {
  id: string;
  cardId: string;
  deckId: string;
  timestamp: number;
  rating: ConfidenceRating;
  responseLatencyMs: number;
  presentationMode: PresentationMode;
  /** Biometric context at time of review */
  biometricSnapshot: BiometricSnapshot | null;
  /** Session context */
  sessionId: string;
  /** Was the recall correct? (good or easy = true) */
  correct: boolean;
}

/** Biometric data snapshot */
export interface BiometricSnapshot {
  /** Timestamp of measurement */
  timestamp: number;
  /** Heart rate from R1 ring (bpm), null if unavailable */
  heartRate: number | null;
  /** HRV from R1 ring (ms), null if unavailable */
  hrv: number | null;
  /** SpO2 percentage, null if unavailable */
  spo2: number | null;
  /** IMU data from Frame glasses */
  imu: { x: number; y: number; z: number } | null;
  /** Self-reported state */
  selfReportedState: 'good' | 'tired' | 'stressed' | null;
}

/** Study session */
export interface StudySession {
  id: string;
  deckId: string;
  startTime: number;
  endTime: number | null;
  cardsReviewed: number;
  cardsCorrect: number;
  averageLatencyMs: number;
  /** Pre-session self-report */
  preSessionState: 'good' | 'tired' | 'stressed' | null;
  /** Post-session perceived effort */
  postSessionEffort: 'easy' | 'moderate' | 'hard' | null;
  /** Biometric summary for the session */
  biometricSummary: {
    avgHeartRate: number | null;
    avgHrv: number | null;
    avgSpo2: number | null;
  };
  reviewEvents: string[]; // ReviewEvent IDs
}

/** User learning profile */
export interface LearningProfile {
  userId: string;
  /** Which presentation modes work best overall */
  globalModePreferences: Record<PresentationMode, number>;
  /** Per-complexity preferences */
  complexityModePreferences: Record<ComplexityTag, Partial<Record<PresentationMode, number>>>;
  /** Optimal study time windows discovered */
  optimalStudyWindows: { hourStart: number; hourEnd: number; score: number }[];
  /** Average session duration before diminishing returns (minutes) */
  optimalSessionDuration: number;
  /** Running stats */
  totalCards: number;
  totalSessions: number;
  totalReviewEvents: number;
  longestStreak: number;
  /** HRV threshold below which to reduce difficulty */
  hrvThreshold: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Generate a UUID */
export function generateId(): string {
  return crypto.randomUUID();
}

/** Create a default CardReviewState for a new card */
export function createDefaultReviewState(cardId: string, deckId: string): CardReviewState {
  return {
    cardId,
    deckId,
    repetitions: 0,
    easeFactor: 2.5,
    interval: 0,
    dueDate: Date.now(),
    lastReview: null,
    totalReviews: 0,
    streak: 0,
    bestPresentationMode: null,
    modePerformance: {},
  };
}

/** Create a default LearningProfile */
export function createDefaultProfile(): LearningProfile {
  const modes: PresentationMode[] = [
    'definition', 'analogy', 'example', 'visual',
    'socratic', 'mnemonic', 'step-by-step', 'contrast',
  ];
  const globalModePreferences = {} as Record<PresentationMode, number>;
  modes.forEach(m => (globalModePreferences[m] = 1.0));

  return {
    userId: generateId(),
    globalModePreferences,
    complexityModePreferences: {
      vocabulary: {},
      concept: {},
      procedure: {},
      application: {},
      analysis: {},
    },
    optimalStudyWindows: [],
    optimalSessionDuration: 15,
    totalCards: 0,
    totalSessions: 0,
    totalReviewEvents: 0,
    longestStreak: 0,
    hrvThreshold: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
