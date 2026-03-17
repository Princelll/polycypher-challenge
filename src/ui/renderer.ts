// ============================================================
// BioLoop UI Renderer
// Single-page application with dashboard, study, and analytics views
// ============================================================

import { Deck, ConfidenceRating } from '../core/models';
import { ConnectionStatus } from '../frame/connection';
import { SessionPhase } from '../core/session';
import { DeckStats, SessionStats } from '../core/analytics';

export interface UICallbacks {
  onConnect: () => void;
  onDisconnect: () => void;
  onSelectDeck: (deckId: string) => void;
  onStartSession: (preState: 'good' | 'tired' | 'stressed' | null) => void;
  onRevealAnswer: () => void;
  onRateCard: (rating: ConfidenceRating) => void;
  onEndSession: () => void;
  onImportDeck: (json: string) => void;
}

export interface UIState {
  decks: Deck[];
  currentDeckId: string | null;
  frameStatus: ConnectionStatus;
  sessionPhase: SessionPhase;
  deckStats: DeckStats | null;
  sessionStats: SessionStats | null;
  insights: string[];
  logs: string[];
  callbacks: UICallbacks;
}

let currentCallbacks: UICallbacks | null = null;

export function renderUI(state: UIState): void {
  currentCallbacks = state.callbacks;
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <header class="header">
      <div class="header-left">
        <h1 class="logo">BioLoop</h1>
        <span class="tagline">Biometric-Adaptive Spaced Repetition</span>
      </div>
      <div class="header-right">
        ${renderFrameStatus(state.frameStatus)}
      </div>
    </header>

    <main class="main">
      ${state.sessionPhase !== 'idle' && state.sessionPhase !== 'complete'
        ? renderStudyView(state)
        : renderDashboard(state)}
    </main>

    <footer class="log-panel">
      <details>
        <summary>System Log (${state.logs.length})</summary>
        <div class="log-entries">
          ${state.logs.slice(-20).reverse().map(l => `<div class="log-entry">${escapeHtml(l)}</div>`).join('')}
        </div>
      </details>
    </footer>
  `;

  bindEvents(state);
}

function renderFrameStatus(status: ConnectionStatus): string {
  const statusColors: Record<ConnectionStatus, string> = {
    disconnected: '#666',
    connecting: '#f0ad4e',
    connected: '#5cb85c',
    error: '#d9534f',
  };
  const color = statusColors[status];
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return `
    <div class="frame-status">
      <span class="status-dot" style="background:${color}"></span>
      <span>Frame: ${label}</span>
      ${status === 'disconnected' || status === 'error'
        ? '<button class="btn btn-sm" id="btn-connect">Connect</button>'
        : status === 'connected'
          ? '<button class="btn btn-sm btn-outline" id="btn-disconnect">Disconnect</button>'
          : '<span class="spinner"></span>'
      }
    </div>
  `;
}

function renderDashboard(state: UIState): string {
  return `
    <div class="dashboard">
      <section class="section">
        <h2>Decks</h2>
        <div class="deck-grid">
          ${state.decks.map(deck => renderDeckCard(deck, state)).join('')}
        </div>
      </section>

      ${state.currentDeckId ? renderDeckDetails(state) : ''}

      ${state.sessionStats && state.sessionStats.totalSessions > 0
        ? renderAnalytics(state)
        : ''
      }

      ${state.insights.length > 0 ? renderInsights(state.insights) : ''}

      <section class="section">
        <h2>Import Deck</h2>
        <div class="import-area">
          <textarea id="import-json" placeholder="Paste deck JSON here..." rows="4"></textarea>
          <button class="btn" id="btn-import">Import</button>
        </div>
      </section>
    </div>
  `;
}

function renderDeckCard(deck: Deck, state: UIState): string {
  const isSelected = deck.id === state.currentDeckId;
  return `
    <div class="deck-card ${isSelected ? 'selected' : ''}" data-deck-id="${deck.id}">
      <h3>${escapeHtml(deck.name)}</h3>
      <p class="deck-desc">${escapeHtml(deck.description)}</p>
      <div class="deck-meta">
        <span>${deck.cards.length} cards</span>
      </div>
    </div>
  `;
}

function renderDeckDetails(state: UIState): string {
  const deck = state.decks.find(d => d.id === state.currentDeckId);
  if (!deck) return '';

  const stats = state.deckStats;

  return `
    <section class="section deck-details">
      <h2>${escapeHtml(deck.name)}</h2>
      ${stats ? `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.cardsDue}</div>
            <div class="stat-label">Due Now</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.cardsNew}</div>
            <div class="stat-label">New</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.cardsMature}</div>
            <div class="stat-label">Mature</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${Math.round(stats.retentionRate * 100)}%</div>
            <div class="stat-label">Retention</div>
          </div>
        </div>
      ` : ''}

      <div class="session-start">
        <h3>Pre-Session Check-in</h3>
        <p>How are you feeling right now?</p>
        <div class="checkin-buttons">
          <button class="btn btn-good" data-prestate="good">Good</button>
          <button class="btn btn-tired" data-prestate="tired">Tired</button>
          <button class="btn btn-stressed" data-prestate="stressed">Stressed</button>
          <button class="btn btn-outline" data-prestate="skip">Skip</button>
        </div>
      </div>
    </section>
  `;
}

function renderStudyView(state: UIState): string {
  const phase = state.sessionPhase;

  return `
    <div class="study-view">
      <div class="study-header">
        <button class="btn btn-sm btn-outline" id="btn-end-session">End Session</button>
        <div class="study-progress">
          Cards reviewed: <strong id="cards-count">—</strong>
        </div>
      </div>

      <div class="card-display">
        <div class="card-content" id="card-content">
          ${phase === 'studying'
            ? '<p class="card-hint">Tap Frame or click to reveal answer</p>'
            : phase === 'awaiting-rating'
              ? renderRatingButtons()
              : '<p>Loading next card...</p>'
          }
        </div>
      </div>

      ${phase === 'studying' ? `
        <div class="study-actions">
          <button class="btn btn-lg" id="btn-reveal">Show Answer</button>
        </div>
      ` : ''}

      <div class="frame-hint">
        ${state.frameStatus === 'connected'
          ? 'Frame connected — cards display on glasses. Tap: single=good, double=again, triple=easy'
          : 'Frame not connected — use on-screen buttons'
        }
      </div>
    </div>
  `;
}

function renderRatingButtons(): string {
  return `
    <div class="rating-buttons">
      <button class="btn btn-again" data-rating="again">Again</button>
      <button class="btn btn-hard" data-rating="hard">Hard</button>
      <button class="btn btn-good-rate" data-rating="good">Good</button>
      <button class="btn btn-easy" data-rating="easy">Easy</button>
    </div>
  `;
}

function renderAnalytics(state: UIState): string {
  const stats = state.sessionStats!;

  return `
    <section class="section">
      <h2>Analytics</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.totalSessions}</div>
          <div class="stat-label">Sessions</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.totalCardsReviewed}</div>
          <div class="stat-label">Cards Reviewed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${Math.round(stats.averageAccuracy * 100)}%</div>
          <div class="stat-label">Accuracy</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${Math.round(stats.averageSessionDuration)}m</div>
          <div class="stat-label">Avg Duration</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${Math.round(stats.averageLatencyMs / 1000)}s</div>
          <div class="stat-label">Avg Response</div>
        </div>
        ${stats.bestHour !== null ? `
          <div class="stat-card highlight">
            <div class="stat-value">${stats.bestHour}:00</div>
            <div class="stat-label">Best Study Hour</div>
          </div>
        ` : ''}
      </div>
    </section>
  `;
}

function renderInsights(insights: string[]): string {
  return `
    <section class="section insights">
      <h2>Insights</h2>
      <ul class="insight-list">
        ${insights.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
      </ul>
    </section>
  `;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function bindEvents(state: UIState): void {
  const cb = state.callbacks;

  // Frame connect/disconnect
  document.getElementById('btn-connect')?.addEventListener('click', () => cb.onConnect());
  document.getElementById('btn-disconnect')?.addEventListener('click', () => cb.onDisconnect());

  // Deck selection
  document.querySelectorAll('.deck-card').forEach(el => {
    el.addEventListener('click', () => {
      const deckId = (el as HTMLElement).dataset.deckId;
      if (deckId) cb.onSelectDeck(deckId);
    });
  });

  // Pre-session check-in buttons
  document.querySelectorAll('[data-prestate]').forEach(el => {
    el.addEventListener('click', () => {
      const prestate = (el as HTMLElement).dataset.prestate;
      if (prestate === 'skip') {
        cb.onStartSession(null);
      } else {
        cb.onStartSession(prestate as 'good' | 'tired' | 'stressed');
      }
    });
  });

  // Study view
  document.getElementById('btn-reveal')?.addEventListener('click', () => cb.onRevealAnswer());
  document.getElementById('btn-end-session')?.addEventListener('click', () => cb.onEndSession());

  // Rating buttons
  document.querySelectorAll('[data-rating]').forEach(el => {
    el.addEventListener('click', () => {
      const rating = (el as HTMLElement).dataset.rating as ConfidenceRating;
      cb.onRateCard(rating);
    });
  });

  // Import
  document.getElementById('btn-import')?.addEventListener('click', () => {
    const textarea = document.getElementById('import-json') as HTMLTextAreaElement;
    if (textarea?.value) cb.onImportDeck(textarea.value);
  });
}
