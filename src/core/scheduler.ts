// ============================================================
// Adaptive Learning SM-2+ Spaced Repetition Scheduler
// with Z-Score Biometric Modifiers (Cheng 2022, Schiweck 2018)
// ============================================================

import {
  CardReviewState,
  ConfidenceRating,
  CONFIDENCE_QUALITY,
  BiometricSnapshot,
  BiometricZScores,
  Confounders,
  DailyBiometric,
  CalibrationStatus,
  SessionRecommendation,
  PresentationMode,
  LearningProfile,
  ComplexityTag,
} from './models';

/** Scheduler configuration */
export interface SchedulerConfig {
  maxInterval: number;
  minEaseFactor: number;
  fuzzPercent: number;
  biometricWeight: number;
  learningSteps: number[];
}

const DEFAULT_CONFIG: SchedulerConfig = {
  maxInterval: 365,
  minEaseFactor: 1.3,
  fuzzPercent: 0.05,
  biometricWeight: 0.3,
  learningSteps: [1, 10],
};

const CALIBRATION_DAYS = 7;

export class Scheduler {
  private config: SchedulerConfig;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Z-score utilities ──────────────────────────────────────

  /** Compute z-score of value against history. Returns 0 if < 3 data points. */
  computeZScore(value: number, history: number[]): number {
    if (history.length < 3) return 0;
    const mean = history.reduce((s, v) => s + v, 0) / history.length;
    const variance = history.reduce((s, v) => s + (v - mean) ** 2, 0) / history.length;
    const sd = Math.sqrt(variance);
    if (sd < 1e-9) return 0;
    return (value - mean) / sd;
  }

  /** Check calibration status based on biometric history */
  calibrationStatus(history: DailyBiometric[]): CalibrationStatus {
    const days = history.length;
    const calibrated = days >= CALIBRATION_DAYS;
    const daysRemaining = Math.max(0, CALIBRATION_DAYS - days);
    return {
      calibrated,
      daysRemaining,
      totalDays: CALIBRATION_DAYS,
      message: calibrated
        ? 'Personal baseline calibrated — z-score modifiers active'
        : `${daysRemaining} more day${daysRemaining !== 1 ? 's' : ''} of data needed for personal baseline`,
    };
  }

  // ── Session recommendation ─────────────────────────────────

  /** Hard stops and review-only modes based on z-scores */
  getSessionRecommendation(zScores: BiometricZScores): SessionRecommendation {
    // Hard stops
    if (zScores.rmssdZ < -3) {
      return {
        mode: 'stop',
        cards: 0,
        reason: 'HRV critically low (RMSSD z < -3σ) — rest recommended',
      };
    }
    if (zScores.spo2DipZ > 3) {
      return {
        mode: 'stop',
        cards: 0,
        reason: 'SpO2 dipping severely elevated (z > 3σ) — consult a physician',
      };
    }

    // Review-only conditions
    if (zScores.rmssdZ < -2) {
      return {
        mode: 'review_only',
        cards: 10,
        reason: 'HRV below baseline (RMSSD z < -2σ) — light review only',
      };
    }
    if (zScores.stressState > 0.8 && zScores.cognitiveLoad > 0.7) {
      return {
        mode: 'review_only',
        cards: 10,
        reason: 'High stress and cognitive load — reviewing known cards only',
      };
    }

    // Normal — scale cards to biometric state
    let cards = 20;
    if (zScores.rmssdZ < -1) cards = 15;
    if (zScores.sleepQuality < 0.5) cards = Math.min(cards, 15);

    return { mode: 'normal', cards, reason: null };
  }

  // ── Z-score biometric modifier ─────────────────────────────

  /**
   * Compute multiplicative interval modifier from z-scores + confounders.
   * Returns a value in 0.5–1.05 range applied to interval (not ease factor).
   */
  computeBiometricModifierFromZScores(
    zScores: BiometricZScores,
    _confounders: Confounders,
  ): number {
    let modifier = 1.0;

    // RMSSD z-score (most important)
    if (zScores.rmssdZ < -2) modifier = Math.min(modifier, 0.55);
    else if (zScores.rmssdZ < -1.5) modifier = Math.min(modifier, 0.65);
    else if (zScores.rmssdZ < -1) modifier = Math.min(modifier, 0.78);
    else if (zScores.rmssdZ < -0.5) modifier = Math.min(modifier, 0.90);
    else if (zScores.rmssdZ > 1) modifier = Math.min(1.05, modifier * 1.05);

    // SpO2 dip z-score
    if (zScores.spo2DipZ > 2) modifier = Math.min(modifier, 0.65);
    else if (zScores.spo2DipZ > 1) modifier = Math.min(modifier, 0.80);
    else if (zScores.spo2DipZ > 0.5) modifier = Math.min(modifier, 0.90);

    // Resting HR z-score
    if (zScores.restingHRZ > 2) modifier = Math.min(modifier, 0.75);
    else if (zScores.restingHRZ > 1) modifier = Math.min(modifier, 0.88);

    // Sleep quality (self-report 0–1)
    if (zScores.sleepQuality < 0.3) modifier = Math.min(modifier, 0.72);
    else if (zScores.sleepQuality < 0.5) modifier = Math.min(modifier, 0.85);
    else if (zScores.sleepQuality < 0.7) modifier = Math.min(modifier, 0.93);

    // Stress state (self-report 0–1)
    if (zScores.stressState > 0.8) modifier = Math.min(modifier, 0.78);
    else if (zScores.stressState > 0.6) modifier = Math.min(modifier, 0.88);
    else if (zScores.stressState > 0.4) modifier = Math.min(modifier, 0.95);

    return Math.max(0.5, Math.min(1.05, modifier));
  }

  // ── Core SM-2+ scheduler ───────────────────────────────────

  schedule(
    state: CardReviewState,
    rating: ConfidenceRating,
    biometrics: BiometricSnapshot | null,
    profile: LearningProfile | null,
    responseLatencyMs: number,
  ): CardReviewState {
    const quality = CONFIDENCE_QUALITY[rating];
    const now = Date.now();
    const newState = { ...state };
    newState.lastReview = now;
    newState.totalReviews++;

    const correct = quality >= 3;
    newState.streak = correct ? state.streak + 1 : 0;

    // SM-2 ease factor
    let newEase = state.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    newEase = Math.max(this.config.minEaseFactor, newEase);
    newState.easeFactor = newEase;

    // Interval calculation
    let newInterval: number;

    if (!correct) {
      newState.repetitions = 0;
      newInterval = 0;
      newState.dueDate = now + this.config.learningSteps[0] * 60 * 1000;
      newState.interval = 0;
      return newState;
    } else if (state.repetitions === 0) {
      newState.repetitions = 1;
      newInterval = 1;
    } else if (state.repetitions === 1) {
      newState.repetitions = 2;
      newInterval = 6;
    } else {
      newState.repetitions = state.repetitions + 1;
      newInterval = Math.round(state.interval * newEase);
      newInterval = Math.round(newInterval * this.computeLatencyModifier(responseLatencyMs));
      newInterval = this.applyFuzz(newInterval);
    }

    // Apply z-score biometric modifier to interval (not ease factor)
    if (biometrics?.zScores && profile?.confounders) {
      const bioMod = this.computeBiometricModifierFromZScores(
        biometrics.zScores,
        profile.confounders,
      );
      newInterval = Math.round(newInterval * bioMod);
    } else if (biometrics) {
      // Legacy absolute modifier
      const legacyMod = this.computeLegacyBiometricModifier(biometrics, profile);
      newEase = Math.max(
        this.config.minEaseFactor,
        newEase * (1 + legacyMod * this.config.biometricWeight),
      );
      newState.easeFactor = newEase;
    }

    // Easy bonus
    if (rating === 'easy') {
      newInterval = Math.round(newInterval * 1.3);
    }

    newInterval = Math.min(Math.max(1, newInterval), this.config.maxInterval);
    newState.interval = newInterval;
    newState.dueDate = now + newInterval * 24 * 60 * 60 * 1000;

    return newState;
  }

  /**
   * Select presentation mode – stress > 0.7 → simple styles only.
   */
  selectPresentationMode(
    state: CardReviewState,
    profile: LearningProfile | null,
    complexity: ComplexityTag,
    zScores?: BiometricZScores | null,
  ): PresentationMode {
    const simpleStyles: PresentationMode[] = ['definition', 'example', 'mnemonic'];
    const highStress = zScores && zScores.stressState > 0.7;

    if (state.bestPresentationMode && Math.random() > 0.2) {
      const mode = state.bestPresentationMode;
      if (highStress && !simpleStyles.includes(mode)) {
        return simpleStyles[Math.floor(Math.random() * simpleStyles.length)];
      }
      return mode;
    }

    if (profile) {
      const prefs = highStress
        ? Object.fromEntries(
            Object.entries(profile.globalModePreferences).filter(([k]) =>
              simpleStyles.includes(k as PresentationMode),
            ),
          )
        : profile.complexityModePreferences[complexity] &&
            Object.keys(profile.complexityModePreferences[complexity]).length > 0
          ? (profile.complexityModePreferences[complexity] as Record<string, number>)
          : profile.globalModePreferences;

      return this.weightedRandomSelect(prefs as Record<string, number>) as PresentationMode;
    }

    return 'definition';
  }

  private weightedRandomSelect(weights: Record<string, number>): string {
    const entries = Object.entries(weights);
    if (entries.length === 0) return 'definition';
    const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
    if (total === 0) return entries[0][0];
    let r = Math.random() * total;
    for (const [key, weight] of entries) {
      r -= Math.max(0, weight);
      if (r <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  getDueCards(states: CardReviewState[], now: number = Date.now()): CardReviewState[] {
    return states
      .filter(s => s.dueDate <= now)
      .sort((a, b) => (now - b.dueDate) - (now - a.dueDate));
  }

  shouldEndSession(
    cardsReviewed: number,
    sessionDurationMin: number,
    recentAccuracy: number,
    profile: LearningProfile | null,
  ): { shouldEnd: boolean; reason: string } {
    const maxDuration = profile?.optimalSessionDuration ?? 15;
    if (sessionDurationMin >= maxDuration) {
      return { shouldEnd: true, reason: `Session duration (${Math.round(sessionDurationMin)}min) reached optimal limit` };
    }
    if (cardsReviewed >= 5 && recentAccuracy < 0.5) {
      return { shouldEnd: true, reason: 'Recent accuracy dropped below 50% — cognitive fatigue detected' };
    }
    if (cardsReviewed >= 50) {
      return { shouldEnd: true, reason: 'Maximum cards per session reached (50)' };
    }
    return { shouldEnd: false, reason: '' };
  }

  updateProfile(
    profile: LearningProfile,
    mode: PresentationMode,
    complexity: ComplexityTag,
    correct: boolean,
  ): LearningProfile {
    const updated = { ...profile };
    const modeScore = updated.globalModePreferences[mode] ?? 1.0;
    updated.globalModePreferences[mode] = correct
      ? Math.min(3.0, modeScore + 0.1)
      : Math.max(0.1, modeScore - 0.15);

    if (!updated.complexityModePreferences[complexity]) {
      updated.complexityModePreferences[complexity] = {};
    }
    const compScore = updated.complexityModePreferences[complexity][mode] ?? 1.0;
    updated.complexityModePreferences[complexity][mode] = correct
      ? Math.min(3.0, compScore + 0.15)
      : Math.max(0.1, compScore - 0.2);

    updated.totalReviewEvents++;
    updated.updatedAt = Date.now();
    return updated;
  }

  // ── Private helpers ────────────────────────────────────────

  private computeLegacyBiometricModifier(
    biometrics: BiometricSnapshot,
    profile: LearningProfile | null,
  ): number {
    let modifier = 0;
    let factors = 0;

    const hrv = biometrics.rmssd ?? biometrics.hrv;
    if (hrv !== null && profile?.hrvThreshold) {
      const ratio = hrv / profile.hrvThreshold;
      modifier += Math.max(-0.5, Math.min(0.5, (ratio - 1) * 0.5));
      factors++;
    }
    if (biometrics.selfReportedState) {
      const map = { good: 0.2, tired: -0.3, stressed: -0.2 };
      modifier += map[biometrics.selfReportedState];
      factors++;
    }
    if (biometrics.heartRate !== null) {
      if (biometrics.heartRate > 90) modifier -= 0.15;
      else if (biometrics.heartRate < 65) modifier += 0.1;
      factors++;
    }
    return factors > 0 ? modifier / factors : 0;
  }

  private computeLatencyModifier(latencyMs: number): number {
    const s = latencyMs / 1000;
    if (s < 3) return 1.15;
    if (s < 8) return 1.0;
    if (s < 15) return 0.9;
    return 0.8;
  }

  private applyFuzz(interval: number): number {
    if (interval <= 2) return interval;
    const fuzz = 1 + (Math.random() * 2 - 1) * this.config.fuzzPercent;
    return Math.max(1, Math.round(interval * fuzz));
  }
}
