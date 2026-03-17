// ============================================================
// BioLoop UI Renderer
// Z-score pre-session panel + model dashboard
// ============================================================

import { Deck, ConfidenceRating, BiometricZScores, Confounders } from '../core/models';
import { ConnectionStatus } from '../frame/connection';
import { SessionPhase } from '../core/session';
import { DeckStats, SessionStats } from '../core/analytics';
import { ModelDashboard } from '../core/models';
import { CalibrationStatus, SessionRecommendation } from '../core/models';

export interface UICallbacks {
  onConnect: () => void;
  onDisconnect: () => void;
  onSelectDeck: (deckId: string) => void;
  onStartSession: (preState: 'good' | 'tired' | 'stressed' | null) => void;
  onRevealAnswer: () => void;
  onRateCard: (rating: ConfidenceRating) => void;
  onEndSession: () => void;
  onImportDeck: (json: string) => void;
  onZScoreChange: (zScores: BiometricZScores) => void;
  onConfounderChange: (confounders: Confounders) => void;
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
  // Z-score fields
  currentZScores: BiometricZScores | null;
  currentConfounders: Confounders | null;
  calibrationStatus: CalibrationStatus | null;
  sessionRecommendation: SessionRecommendation | null;
  modelDashboard: ModelDashboard | null;
}

let currentCallbacks: UICallbacks | null = null;
let _currentZScores: BiometricZScores = defaultZScores();
let _currentConfounders: Confounders = defaultConfounders();

function defaultZScores(): BiometricZScores {
  return {
    rmssdZ: 0,
    spo2DipZ: 0,
    restingHRZ: 0,
    sleepQuality: 0.7,
    stressState: 0.3,
    cognitiveLoad: 0.3,
  };
}

function defaultConfounders(): Confounders {
  return { onSSRI: false, bmiCategory: 'normal', smoker: false };
}

export function renderUI(state: UIState): void {
  currentCallbacks = state.callbacks;
  if (state.currentZScores) _currentZScores = state.currentZScores;
  if (state.currentConfounders) _currentConfounders = state.currentConfounders;

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
  const colors: Record<ConnectionStatus, string> = {
    disconnected: '#666', connecting: '#f0ad4e', connected: '#5cb85c', error: '#d9534f',
  };
  return `
    <div class="frame-status">
      <span class="status-dot" style="background:${colors[status]}"></span>
      <span>Frame: ${status.charAt(0).toUpperCase() + status.slice(1)}</span>
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

      ${state.modelDashboard ? renderModelDashboard(state.modelDashboard) : ''}

      ${state.sessionStats && state.sessionStats.totalSessions > 0 ? renderAnalytics(state) : ''}

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
      <div class="deck-meta"><span>${deck.cards.length} cards</span></div>
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
          <div class="stat-card"><div class="stat-value">${stats.cardsDue}</div><div class="stat-label">Due Now</div></div>
          <div class="stat-card"><div class="stat-value">${stats.cardsNew}</div><div class="stat-label">New</div></div>
          <div class="stat-card"><div class="stat-value">${stats.cardsMature}</div><div class="stat-label">Mature</div></div>
          <div class="stat-card"><div class="stat-value">${Math.round(stats.retentionRate * 100)}%</div><div class="stat-label">Retention</div></div>
        </div>
      ` : ''}

      ${renderCalibrationBanner(state.calibrationStatus)}
      ${renderSessionRecommendation(state.sessionRecommendation)}
      ${renderZScorePanel(_currentZScores)}
      ${renderConfounderPanel(_currentConfounders)}

      <div class="session-start">
        <h3>How are you feeling?</h3>
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

function renderCalibrationBanner(status: CalibrationStatus | null): string {
  if (!status) return '';
  const cls = status.calibrated ? 'calibration-banner calibrated' : 'calibration-banner uncalibrated';
  return `
    <div class="${cls}">
      <span class="calibration-icon">${status.calibrated ? '✓' : '⏳'}</span>
      <span>${escapeHtml(status.message)}</span>
    </div>
  `;
}

function renderSessionRecommendation(rec: SessionRecommendation | null): string {
  if (!rec || rec.mode === 'normal') return '';
  const cls = rec.mode === 'stop' ? 'rec-banner rec-stop' : 'rec-banner rec-review';
  const icon = rec.mode === 'stop' ? '🛑' : '⚠️';
  return `
    <div class="${cls}">
      ${icon} ${escapeHtml(rec.reason ?? '')}
      ${rec.mode === 'review_only' ? `<span class="rec-cards">(${rec.cards} cards max)</span>` : ''}
    </div>
  `;
}

function renderZScorePanel(z: BiometricZScores): string {
  return `
    <div class="zscore-panel">
      <h3>Biometric Input</h3>
      <p class="panel-note">Enter today's readings (σ = standard deviations from your baseline)</p>

      <div class="slider-row">
        <label>RMSSD <span class="unit">(σ)</span></label>
        <input type="range" id="sl-rmssd" min="-3" max="2" step="0.1"
          value="${z.rmssdZ.toFixed(1)}" class="bio-slider">
        <span class="slider-val" id="val-rmssd">${z.rmssdZ.toFixed(1)}</span>
      </div>

      <div class="slider-row">
        <label>SpO2 dipping <span class="unit">(σ)</span></label>
        <input type="range" id="sl-spo2" min="-1" max="3" step="0.1"
          value="${z.spo2DipZ.toFixed(1)}" class="bio-slider">
        <span class="slider-val" id="val-spo2">${z.spo2DipZ.toFixed(1)}</span>
      </div>

      <div class="slider-row">
        <label>Resting HR <span class="unit">(σ)</span></label>
        <input type="range" id="sl-hr" min="-2" max="3" step="0.1"
          value="${z.restingHRZ.toFixed(1)}" class="bio-slider">
        <span class="slider-val" id="val-hr">${z.restingHRZ.toFixed(1)}</span>
      </div>

      <div class="dropdown-row">
        <label>Sleep quality</label>
        <select id="sel-sleep" class="bio-select">
          <option value="0.1" ${z.sleepQuality <= 0.2 ? 'selected' : ''}>Poor</option>
          <option value="0.4" ${z.sleepQuality > 0.2 && z.sleepQuality <= 0.55 ? 'selected' : ''}>Fair</option>
          <option value="0.7" ${z.sleepQuality > 0.55 && z.sleepQuality <= 0.85 ? 'selected' : ''}>Good</option>
          <option value="1.0" ${z.sleepQuality > 0.85 ? 'selected' : ''}>Great</option>
        </select>
      </div>

      <div class="dropdown-row">
        <label>Stress level</label>
        <select id="sel-stress" class="bio-select">
          <option value="0.1" ${z.stressState <= 0.2 ? 'selected' : ''}>Low</option>
          <option value="0.4" ${z.stressState > 0.2 && z.stressState <= 0.55 ? 'selected' : ''}>Moderate</option>
          <option value="0.7" ${z.stressState > 0.55 && z.stressState <= 0.85 ? 'selected' : ''}>High</option>
          <option value="0.95" ${z.stressState > 0.85 ? 'selected' : ''}>Extreme</option>
        </select>
      </div>

      <div class="dropdown-row">
        <label>Cognitive load</label>
        <select id="sel-cog" class="bio-select">
          <option value="0.1" ${z.cognitiveLoad <= 0.25 ? 'selected' : ''}>Low</option>
          <option value="0.4" ${z.cognitiveLoad > 0.25 && z.cognitiveLoad <= 0.55 ? 'selected' : ''}>Moderate</option>
          <option value="0.8" ${z.cognitiveLoad > 0.55 ? 'selected' : ''}>High</option>
        </select>
      </div>
    </div>
  `;
}

function renderConfounderPanel(c: Confounders): string {
  return `
    <details class="confounders-panel">
      <summary>Health context (collected once)</summary>
      <div class="confounders-body">
        <label class="check-row">
          <input type="checkbox" id="chk-ssri" ${c.onSSRI ? 'checked' : ''}> On SSRIs
          <span class="field-note">SSRIs reduce HRV by ~10–15ms</span>
        </label>
        <label class="check-row">
          <input type="checkbox" id="chk-smoker" ${c.smoker ? 'checked' : ''}> Smoker
        </label>
        <div class="dropdown-row">
          <label>BMI category</label>
          <select id="sel-bmi" class="bio-select">
            <option value="underweight" ${c.bmiCategory === 'underweight' ? 'selected' : ''}>Underweight</option>
            <option value="normal" ${c.bmiCategory === 'normal' ? 'selected' : ''}>Normal</option>
            <option value="overweight" ${c.bmiCategory === 'overweight' ? 'selected' : ''}>Overweight</option>
            <option value="obese" ${c.bmiCategory === 'obese' ? 'selected' : ''}>Obese</option>
          </select>
        </div>
      </div>
    </details>
  `;
}

function renderModelDashboard(dashboard: ModelDashboard): string {
  const statusLabels: Record<string, string> = {
    collecting_data: 'Collecting data',
    initial_model: 'Initial model',
    refined: 'Refined',
    mature: 'Mature',
    error: 'Error',
  };
  const statusClasses: Record<string, string> = {
    collecting_data: 'badge-gray',
    initial_model: 'badge-blue',
    refined: 'badge-teal',
    mature: 'badge-green',
    error: 'badge-red',
  };

  const topStyles = dashboard.styleRanking.slice(0, 5);
  const maxBeta = Math.max(...topStyles.map(s => Math.abs(s.beta)), 0.01);

  return `
    <section class="section model-dashboard">
      <h2>Learning Model
        <span class="badge ${statusClasses[dashboard.status] ?? 'badge-gray'}">
          ${statusLabels[dashboard.status] ?? dashboard.status}
        </span>
      </h2>

      <div class="model-stats">
        <div class="stat-card">
          <div class="stat-value">${dashboard.nObservations}</div>
          <div class="stat-label">Observations</div>
        </div>
        ${dashboard.r2 !== null ? `
          <div class="stat-card">
            <div class="stat-value">${(dashboard.r2 * 100).toFixed(1)}%</div>
            <div class="stat-label">R² (variance explained)</div>
          </div>
        ` : ''}
        <div class="stat-card">
          <div class="stat-value">${dashboard.calibrationDays}/7</div>
          <div class="stat-label">Calibration days</div>
        </div>
      </div>

      ${dashboard.status === 'collecting_data' ? `
        <p class="model-note">Need ${dashboard.observationsNeeded} more card ratings to fit the first model.</p>
      ` : ''}

      ${topStyles.length > 0 ? `
        <h3>Style effectiveness</h3>
        <div class="coef-bars">
          ${topStyles.map(s => `
            <div class="coef-row">
              <span class="coef-label">${escapeHtml(s.style)}</span>
              <div class="coef-track">
                <div class="coef-fill ${s.beta >= 0 ? 'positive' : 'negative'} ${s.significant ? 'sig' : ''}"
                  style="width:${Math.round(Math.abs(s.beta) / maxBeta * 100)}%"></div>
              </div>
              <span class="coef-val ${s.significant ? 'sig' : ''}">${s.beta >= 0 ? '+' : ''}${s.beta.toFixed(2)}</span>
            </div>
          `).join('')}
        </div>
        <p class="coef-note">Bold = statistically significant (p&lt;0.05). Bars relative to largest effect.</p>
      ` : ''}
    </section>
  `;
}

function renderStudyView(state: UIState): string {
  const phase = state.sessionPhase;
  return `
    <div class="study-view">
      <div class="study-header">
        <button class="btn btn-sm btn-outline" id="btn-end-session">End Session</button>
        <div class="study-progress">Cards reviewed: <strong id="cards-count">—</strong></div>
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
        <div class="stat-card"><div class="stat-value">${stats.totalSessions}</div><div class="stat-label">Sessions</div></div>
        <div class="stat-card"><div class="stat-value">${stats.totalCardsReviewed}</div><div class="stat-label">Cards Reviewed</div></div>
        <div class="stat-card"><div class="stat-value">${Math.round(stats.averageAccuracy * 100)}%</div><div class="stat-label">Accuracy</div></div>
        <div class="stat-card"><div class="stat-value">${Math.round(stats.averageSessionDuration)}m</div><div class="stat-label">Avg Duration</div></div>
        <div class="stat-card"><div class="stat-value">${Math.round(stats.averageLatencyMs / 1000)}s</div><div class="stat-label">Avg Response</div></div>
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

function readZScores(): BiometricZScores {
  const get = (id: string) => parseFloat((document.getElementById(id) as HTMLInputElement)?.value ?? '0');
  const getSel = (id: string) => parseFloat((document.getElementById(id) as HTMLSelectElement)?.value ?? '0');
  return {
    rmssdZ: get('sl-rmssd'),
    spo2DipZ: get('sl-spo2'),
    restingHRZ: get('sl-hr'),
    sleepQuality: getSel('sel-sleep'),
    stressState: getSel('sel-stress'),
    cognitiveLoad: getSel('sel-cog'),
  };
}

function readConfounders(): Confounders {
  return {
    onSSRI: (document.getElementById('chk-ssri') as HTMLInputElement)?.checked ?? false,
    smoker: (document.getElementById('chk-smoker') as HTMLInputElement)?.checked ?? false,
    bmiCategory: ((document.getElementById('sel-bmi') as HTMLSelectElement)?.value as Confounders['bmiCategory']) ?? 'normal',
  };
}

function bindEvents(state: UIState): void {
  const cb = state.callbacks;

  document.getElementById('btn-connect')?.addEventListener('click', () => cb.onConnect());
  document.getElementById('btn-disconnect')?.addEventListener('click', () => cb.onDisconnect());

  document.querySelectorAll('.deck-card').forEach(el => {
    el.addEventListener('click', () => {
      const deckId = (el as HTMLElement).dataset.deckId;
      if (deckId) cb.onSelectDeck(deckId);
    });
  });

  // Z-score sliders — live update
  const sliders = ['sl-rmssd', 'sl-spo2', 'sl-hr'];
  sliders.forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement;
    const valId = id.replace('sl-', 'val-');
    el?.addEventListener('input', () => {
      const v = parseFloat(el.value).toFixed(1);
      const valEl = document.getElementById(valId);
      if (valEl) valEl.textContent = v;
      _currentZScores = readZScores();
      cb.onZScoreChange(_currentZScores);
    });
  });

  // Dropdowns
  ['sel-sleep', 'sel-stress', 'sel-cog'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      _currentZScores = readZScores();
      cb.onZScoreChange(_currentZScores);
    });
  });

  // Confounders
  ['chk-ssri', 'chk-smoker', 'sel-bmi'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      _currentConfounders = readConfounders();
      cb.onConfounderChange(_currentConfounders);
    });
  });

  // Pre-session check-in
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

  document.getElementById('btn-reveal')?.addEventListener('click', () => cb.onRevealAnswer());
  document.getElementById('btn-end-session')?.addEventListener('click', () => cb.onEndSession());

  document.querySelectorAll('[data-rating]').forEach(el => {
    el.addEventListener('click', () => {
      const rating = (el as HTMLElement).dataset.rating as ConfidenceRating;
      cb.onRateCard(rating);
    });
  });

  document.getElementById('btn-import')?.addEventListener('click', () => {
    const textarea = document.getElementById('import-json') as HTMLTextAreaElement;
    if (textarea?.value) cb.onImportDeck(textarea.value);
  });
}
