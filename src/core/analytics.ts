// ============================================================
// BioLoop Analytics Engine
// Computes learning statistics and generates insights
// ============================================================

import { ReviewEvent, StudySession, CardReviewState, LearningProfile } from './models';

export interface DeckStats {
  totalCards: number;
  cardsDue: number;
  cardsNew: number;
  cardsMature: number; // interval > 21 days
  averageEase: number;
  averageInterval: number;
  retentionRate: number;
}

export interface SessionStats {
  totalSessions: number;
  totalCardsReviewed: number;
  totalCorrect: number;
  averageAccuracy: number;
  averageSessionDuration: number;
  averageCardsPerSession: number;
  averageLatencyMs: number;
  bestHour: number | null;
  worstHour: number | null;
}

export interface RetentionPoint {
  date: string;
  accuracy: number;
  cardsReviewed: number;
}

export class Analytics {
  /** Compute deck-level statistics */
  static computeDeckStats(states: CardReviewState[], totalCards: number): DeckStats {
    const now = Date.now();
    const due = states.filter(s => s.dueDate <= now).length;
    const newCards = states.filter(s => s.totalReviews === 0).length;
    const mature = states.filter(s => s.interval > 21).length;
    const withReviews = states.filter(s => s.totalReviews > 0);

    return {
      totalCards,
      cardsDue: due,
      cardsNew: newCards,
      cardsMature: mature,
      averageEase: withReviews.length > 0
        ? withReviews.reduce((s, r) => s + r.easeFactor, 0) / withReviews.length
        : 2.5,
      averageInterval: withReviews.length > 0
        ? withReviews.reduce((s, r) => s + r.interval, 0) / withReviews.length
        : 0,
      retentionRate: withReviews.length > 0
        ? withReviews.filter(s => s.streak > 0).length / withReviews.length
        : 0,
    };
  }

  /** Compute session-level statistics */
  static computeSessionStats(sessions: StudySession[]): SessionStats {
    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalCardsReviewed: 0,
        totalCorrect: 0,
        averageAccuracy: 0,
        averageSessionDuration: 0,
        averageCardsPerSession: 0,
        averageLatencyMs: 0,
        bestHour: null,
        worstHour: null,
      };
    }

    const totalCards = sessions.reduce((s, sess) => s + sess.cardsReviewed, 0);
    const totalCorrect = sessions.reduce((s, sess) => s + sess.cardsCorrect, 0);

    // Find best/worst study hours
    const hourStats: Record<number, { correct: number; total: number }> = {};
    for (const sess of sessions) {
      const hour = new Date(sess.startTime).getHours();
      if (!hourStats[hour]) hourStats[hour] = { correct: 0, total: 0 };
      hourStats[hour].correct += sess.cardsCorrect;
      hourStats[hour].total += sess.cardsReviewed;
    }

    let bestHour: number | null = null;
    let worstHour: number | null = null;
    let bestRate = 0;
    let worstRate = 1;

    for (const [hour, stats] of Object.entries(hourStats)) {
      if (stats.total < 5) continue;
      const rate = stats.correct / stats.total;
      if (rate > bestRate) {
        bestRate = rate;
        bestHour = parseInt(hour);
      }
      if (rate < worstRate) {
        worstRate = rate;
        worstHour = parseInt(hour);
      }
    }

    const completedSessions = sessions.filter(s => s.endTime);
    const avgDuration = completedSessions.length > 0
      ? completedSessions.reduce((s, sess) => s + (sess.endTime! - sess.startTime), 0) / completedSessions.length / 60000
      : 0;

    return {
      totalSessions: sessions.length,
      totalCardsReviewed: totalCards,
      totalCorrect,
      averageAccuracy: totalCards > 0 ? totalCorrect / totalCards : 0,
      averageSessionDuration: avgDuration,
      averageCardsPerSession: totalCards / sessions.length,
      averageLatencyMs: sessions.reduce((s, sess) => s + sess.averageLatencyMs, 0) / sessions.length,
      bestHour,
      worstHour,
    };
  }

  /** Generate daily retention curve data */
  static computeRetentionCurve(events: ReviewEvent[], days: number = 30): RetentionPoint[] {
    const now = Date.now();
    const points: RetentionPoint[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * 24 * 60 * 60 * 1000;
      const dayEnd = now - i * 24 * 60 * 60 * 1000;
      const dayEvents = events.filter(e => e.timestamp >= dayStart && e.timestamp < dayEnd);

      if (dayEvents.length > 0) {
        const correct = dayEvents.filter(e => e.correct).length;
        points.push({
          date: new Date(dayStart).toLocaleDateString(),
          accuracy: correct / dayEvents.length,
          cardsReviewed: dayEvents.length,
        });
      }
    }

    return points;
  }

  /** Generate insights from the learning profile */
  static generateInsights(
    profile: LearningProfile,
    sessionStats: SessionStats,
    deckStats: DeckStats,
  ): string[] {
    const insights: string[] = [];

    // Best study time
    if (sessionStats.bestHour !== null) {
      insights.push(`Your best study time is around ${sessionStats.bestHour}:00 — accuracy peaks during this hour.`);
    }

    // Mode preferences
    const sortedModes = Object.entries(profile.globalModePreferences)
      .sort(([, a], [, b]) => b - a);
    if (sortedModes.length > 0 && sortedModes[0][1] > 1.2) {
      insights.push(`"${sortedModes[0][0]}" presentation style works best for you overall.`);
    }

    // Retention
    if (deckStats.retentionRate > 0.8) {
      insights.push(`Strong retention rate (${Math.round(deckStats.retentionRate * 100)}%) — your spacing is well-calibrated.`);
    } else if (deckStats.retentionRate < 0.6 && deckStats.retentionRate > 0) {
      insights.push(`Retention at ${Math.round(deckStats.retentionRate * 100)}% — consider shorter intervals or more frequent sessions.`);
    }

    // Session duration
    if (sessionStats.averageSessionDuration > 20) {
      insights.push(`Average sessions run ${Math.round(sessionStats.averageSessionDuration)}min — consider shorter, more frequent sessions for better retention.`);
    }

    // Maturity
    if (deckStats.cardsMature > 0) {
      insights.push(`${deckStats.cardsMature} cards are mature (21+ day intervals) — long-term memory formation in progress!`);
    }

    if (insights.length === 0) {
      insights.push('Keep studying to unlock personalized insights — the system adapts as it learns your patterns.');
    }

    return insights;
  }
}
