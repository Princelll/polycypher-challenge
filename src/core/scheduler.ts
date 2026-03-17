// ============================================================
// BioLoop SM-2+ Spaced Repetition Scheduler
// with Biometric Modifiers
// ============================================================

import {
  CardReviewState,
  ConfidenceRating,
  CONFIDENCE_QUALITY,
  BiometricSnapshot,
  PresentationMode,
  LearningProfile,
  ComplexityTag,
} from './models';

/** Scheduler configuration */
export interface SchedulerConfig {
  /** Maximum interval in days */
  maxInterval: number;
  /** Minimum ease factor */
  minEaseFactor: number;
  /** Fuzz factor range (±percentage) for interval randomization */
  fuzzPercent: number;
  /** Weight of biometric modifier (0 = ignore biometrics, 1 = full effect) */
  biometricWeight: number;
  /** New card learning steps (minutes) */
  learningSteps: number[];
}

const DEFAULT_CONFIG: SchedulerConfig = {
  maxInterval: 365,
  minEaseFactor: 1.3,
  fuzzPercent: 0.05,
  biometricWeight: 0.3,
  learningSteps: [1, 10],
};

export class Scheduler {
  private config: SchedulerConfig;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Core SM-2+ scheduling with biometric modifiers.
   * Returns updated review state after a rating.
   */
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
    if (correct) {
      newState.streak++;
    } else {
      newState.streak = 0;
    }

    // SM-2 ease factor update
    let newEase = state.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    newEase = Math.max(this.config.minEaseFactor, newEase);

    // Biometric modifier: adjust ease based on cognitive readiness
    const bioMod = this.computeBiometricModifier(biometrics, profile);
    newEase = newEase * (1 + bioMod * this.config.biometricWeight);
    newEase = Math.max(this.config.minEaseFactor, newEase);

    newState.easeFactor = newEase;

    // Interval calculation
    if (!correct) {
      // Failed: reset to learning phase
      newState.repetitions = 0;
      newState.interval = 0;
      // Show again in learningSteps[0] minutes
      newState.dueDate = now + this.config.learningSteps[0] * 60 * 1000;
    } else if (state.repetitions === 0) {
      // First successful review
      newState.repetitions = 1;
      newState.interval = 1;
      newState.dueDate = now + 1 * 24 * 60 * 60 * 1000;
    } else if (state.repetitions === 1) {
      // Second successful review
      newState.repetitions = 2;
      newState.interval = 6;
      newState.dueDate = now + 6 * 24 * 60 * 60 * 1000;
    } else {
      // Subsequent reviews: interval * ease factor
      newState.repetitions = state.repetitions + 1;
      let newInterval = Math.round(state.interval * newEase);

      // Apply response latency modifier: fast correct = bonus, slow correct = penalty
      const latencyMod = this.computeLatencyModifier(responseLatencyMs);
      newInterval = Math.round(newInterval * latencyMod);

      // Apply fuzz to prevent clustering
      newInterval = this.applyFuzz(newInterval);

      // Clamp
      newInterval = Math.min(newInterval, this.config.maxInterval);
      newInterval = Math.max(1, newInterval);

      newState.interval = newInterval;
      newState.dueDate = now + newInterval * 24 * 60 * 60 * 1000;
    }

    // Easy bonus
    if (rating === 'easy' && correct) {
      newState.interval = Math.round(newState.interval * 1.3);
      newState.dueDate = now + newState.interval * 24 * 60 * 60 * 1000;
    }

    return newState;
  }

  /**
   * Compute biometric modifier (-1 to +1 range).
   * Positive = good cognitive state = extend interval.
   * Negative = poor state = shorten interval.
   */
  private computeBiometricModifier(
    biometrics: BiometricSnapshot | null,
    profile: LearningProfile | null,
  ): number {
    if (!biometrics) return 0;

    let modifier = 0;
    let factors = 0;

    // HRV-based modifier: higher HRV = better parasympathetic tone = better encoding
    if (biometrics.hrv !== null && profile?.hrvThreshold) {
      const hrvRatio = biometrics.hrv / profile.hrvThreshold;
      modifier += Math.max(-0.5, Math.min(0.5, (hrvRatio - 1) * 0.5));
      factors++;
    }

    // Self-reported state
    if (biometrics.selfReportedState) {
      const stateModifiers = { good: 0.2, tired: -0.3, stressed: -0.2 };
      modifier += stateModifiers[biometrics.selfReportedState];
      factors++;
    }

    // Heart rate: elevated HR may indicate stress
    if (biometrics.heartRate !== null) {
      // Simple heuristic: resting HR > 90 = stressed
      if (biometrics.heartRate > 90) {
        modifier -= 0.15;
      } else if (biometrics.heartRate < 65) {
        modifier += 0.1; // calm state
      }
      factors++;
    }

    return factors > 0 ? modifier / factors : 0;
  }

  /**
   * Response latency modifier.
   * Fast correct recall (< 3s) = strong encoding = extend interval.
   * Slow correct recall (> 15s) = fragile trace = shorten interval.
   */
  private computeLatencyModifier(latencyMs: number): number {
    const latencySec = latencyMs / 1000;
    if (latencySec < 3) return 1.15; // 15% bonus
    if (latencySec < 8) return 1.0; // normal
    if (latencySec < 15) return 0.9; // 10% penalty
    return 0.8; // 20% penalty for very slow
  }

  /** Add randomized fuzz to prevent card clustering */
  private applyFuzz(interval: number): number {
    if (interval <= 2) return interval;
    const fuzz = 1 + (Math.random() * 2 - 1) * this.config.fuzzPercent;
    return Math.max(1, Math.round(interval * fuzz));
  }

  /**
   * Select the best presentation mode for a card given current context.
   */
  selectPresentationMode(
    state: CardReviewState,
    profile: LearningProfile | null,
    complexity: ComplexityTag,
  ): PresentationMode {
    // If we've found a best mode for this card, use it most of the time
    if (state.bestPresentationMode && Math.random() > 0.2) {
      return state.bestPresentationMode;
    }

    // Check profile preferences for this complexity level
    if (profile) {
      const complexityPrefs = profile.complexityModePreferences[complexity];
      if (complexityPrefs && Object.keys(complexityPrefs).length > 0) {
        return this.weightedRandomSelect(complexityPrefs as Record<string, number>) as PresentationMode;
      }

      // Fall back to global preferences
      return this.weightedRandomSelect(profile.globalModePreferences) as PresentationMode;
    }

    // Default: use definition mode
    return 'definition';
  }

  /** Weighted random selection from a score map */
  private weightedRandomSelect(weights: Record<string, number>): string {
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
    if (total === 0) return entries[0][0];

    let r = Math.random() * total;
    for (const [key, weight] of entries) {
      r -= Math.max(0, weight);
      if (r <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  /**
   * Get cards due for review from a set of review states.
   * Returns sorted by priority (most overdue first).
   */
  getDueCards(states: CardReviewState[], now: number = Date.now()): CardReviewState[] {
    return states
      .filter(s => s.dueDate <= now)
      .sort((a, b) => {
        // Most overdue first
        const overdueA = now - a.dueDate;
        const overdueB = now - b.dueDate;
        return overdueB - overdueA;
      });
  }

  /**
   * Determine if the current session should end based on diminishing returns.
   */
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

    // If accuracy drops below 50% in last 5 cards, cognitive fatigue likely
    if (cardsReviewed >= 5 && recentAccuracy < 0.5) {
      return { shouldEnd: true, reason: 'Recent accuracy dropped below 50% — cognitive fatigue detected' };
    }

    // Hard cap at 50 cards per session
    if (cardsReviewed >= 50) {
      return { shouldEnd: true, reason: 'Maximum cards per session reached (50)' };
    }

    return { shouldEnd: false, reason: '' };
  }

  /**
   * Update learning profile based on a review event.
   */
  updateProfile(
    profile: LearningProfile,
    mode: PresentationMode,
    complexity: ComplexityTag,
    correct: boolean,
  ): LearningProfile {
    const updated = { ...profile };

    // Update global mode preference
    const modeScore = updated.globalModePreferences[mode] ?? 1.0;
    updated.globalModePreferences[mode] = correct
      ? Math.min(3.0, modeScore + 0.1)
      : Math.max(0.1, modeScore - 0.15);

    // Update complexity-specific preference
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
}
