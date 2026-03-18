// ============================================================
// Adaptive Learning OLS Regression Engine
// Pure TypeScript, zero external dependencies
// ============================================================

import { Observation, RegressionResult } from './models';

// ── Matrix math ───────────────────────────────────────────────

type Matrix = number[][];
type Vector = number[];

function transpose(m: Matrix): Matrix {
  if (m.length === 0) return [];
  return m[0].map((_, j) => m.map(row => row[j]));
}

function matMul(a: Matrix, b: Matrix): Matrix {
  const rows = a.length;
  const cols = b[0].length;
  const inner = b.length;
  const result: Matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      for (let k = 0; k < inner; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

function matVecMul(m: Matrix, v: Vector): Vector {
  return m.map(row => row.reduce((s, x, j) => s + x * v[j], 0));
}

/** LU decomposition with partial pivoting. Returns { L, U, P, sign } */
function luDecompose(m: Matrix): { L: Matrix; U: Matrix; P: Matrix; sign: number } {
  const n = m.length;
  const L: Matrix = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
  const U: Matrix = m.map(row => [...row]);
  const P: Matrix = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
  let sign = 1;

  for (let k = 0; k < n; k++) {
    // Find pivot
    let maxVal = Math.abs(U[k][k]);
    let maxRow = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(U[i][k]) > maxVal) {
        maxVal = Math.abs(U[i][k]);
        maxRow = i;
      }
    }

    if (maxRow !== k) {
      [U[k], U[maxRow]] = [U[maxRow], U[k]];
      [P[k], P[maxRow]] = [P[maxRow], P[k]];
      if (k > 0) {
        for (let j = 0; j < k; j++) {
          [L[k][j], L[maxRow][j]] = [L[maxRow][j], L[k][j]];
        }
      }
      sign *= -1;
    }

    if (Math.abs(U[k][k]) < 1e-12) continue;

    for (let i = k + 1; i < n; i++) {
      const factor = U[i][k] / U[k][k];
      L[i][k] = factor;
      for (let j = k; j < n; j++) {
        U[i][j] -= factor * U[k][j];
      }
    }
  }

  return { L, U, P, sign };
}

function solveSystem(L: Matrix, U: Matrix, Pb: Vector): Vector {
  const n = L.length;
  const y: Vector = new Array(n).fill(0);

  // Forward substitution
  for (let i = 0; i < n; i++) {
    y[i] = Pb[i] - L[i].slice(0, i).reduce((s, v, j) => s + v * y[j], 0);
  }

  // Back substitution
  const x: Vector = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = (y[i] - U[i].slice(i + 1).reduce((s, v, j) => s + v * x[i + 1 + j], 0)) / U[i][i];
  }

  return x;
}

function invertMatrix(m: Matrix): Matrix | null {
  const n = m.length;
  const { L, U, P } = luDecompose(m);
  const inv: Matrix = [];

  for (let j = 0; j < n; j++) {
    const e: Vector = new Array(n).fill(0);
    e[j] = 1;
    const Pb = matVecMul(P, e);
    try {
      inv.push(solveSystem(L, U, Pb));
    } catch {
      return null;
    }
  }

  return transpose(inv);
}

// ── Statistics ────────────────────────────────────────────────

/** Lanczos approximation of log-gamma */
function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Regularized incomplete beta via Lentz continued fraction */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x < 0 || x > 1) return NaN;
  if (x === 0) return 0;
  if (x === 1) return 1;

  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;

  // Lentz method
  const maxIter = 200;
  const eps = 3e-7;
  let fpmin = 1e-30;

  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    h *= d * c;

    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < eps) break;
  }

  return front * h;
}

/** Survival function of t-distribution (two-tailed p-value) */
function tDistSF(t: number, df: number): number {
  const x = df / (df + t * t);
  const p = regularizedIncompleteBeta(x, df / 2, 0.5);
  return Math.min(1, p);
}

// ── Feature engineering ───────────────────────────────────────

const ALL_STYLES: string[] = [
  'definition', 'analogy', 'example', 'visual',
  'socratic', 'mnemonic', 'step-by-step', 'contrast',
  'real_life_example', 'clinical_example', 'story',
];
const BASELINE_STYLE = 'socratic';

// Ridge regression penalty (L2 regularization)
// Prevents overfitting when observations << predictors
const RIDGE_LAMBDA = 0.1;

// Temporal decay: recent observations weighted more heavily
// Half-life in days — observations older than this get 50% weight
const DECAY_HALF_LIFE_DAYS = 14;

function computeLearningScore(obs: Observation): number {
  const o = obs.outcomes;
  // Include latency as a factor: faster correct answers score higher
  const latencyBonus = o.recalledCorrectly
    ? Math.max(0, 1 - o.latencyMs / 15000) * 0.5  // 0-0.5 bonus for speed
    : 0;
  return (
    o.masteryGain * 2 +
    (o.quickfireCorrect ? 1 : 0) * 1.5 +
    (o.elaborated ? 1 : 0) * 1.0 +
    (o.madeOwnConnection ? 1 : 0) * 1.0 -
    (o.neededReexplanation ? 1 : 0) * 1.5 +
    latencyBonus
  );
}

/**
 * Compute temporal weight for an observation.
 * Recent observations get weight ~1.0, older ones decay exponentially.
 */
function temporalWeight(obsTimestamp: number, now: number): number {
  const ageDays = (now - obsTimestamp) / 86400000;
  return Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS);
}

function buildDesignMatrix(observations: Observation[]): { X: Matrix; y: Vector; W: Vector; colNames: string[] } {
  const styleNames = ALL_STYLES.filter(s => s !== BASELINE_STYLE);

  const colNames = [
    'intercept',
    // Style dummies (vs socratic baseline)
    ...styleNames.map(s => `style_${s}`),
    // Context factors
    'stressLevel',
    'energyLevel',
    'timeOfDay_morning',
    'timeOfDay_afternoon',
    'timeOfDay_evening',
    'topicPosition',
    'minutesIntoSession',
    'daysSinceLastStudy',
    'priorLevel',
    // Interaction: stress × complexity (high stress + hard topic = bigger penalty)
    'stress_x_complex',
    // Confounders
    'onSSRI',
    'smoker',
    'bmi_overweight',
    'bmi_obese',
  ];

  const X: Matrix = [];
  const y: Vector = [];
  const W: Vector = []; // temporal weights
  const now = Date.now();

  // Complexity to numeric mapping for interaction term
  const complexityMap: Record<string, number> = {
    vocabulary: 0.2,
    concept: 0.4,
    procedure: 0.6,
    application: 0.8,
    analysis: 1.0,
  };

  for (const obs of observations) {
    const row: number[] = [1]; // intercept

    // Style dummies
    for (const s of styleNames) {
      row.push(obs.features.explanationStyle === s ? 1 : 0);
    }

    // Context
    row.push(obs.features.stressLevel);
    row.push(obs.features.energyLevel);
    row.push(obs.features.timeOfDay === 'morning' ? 1 : 0);
    row.push(obs.features.timeOfDay === 'afternoon' ? 1 : 0);
    row.push(obs.features.timeOfDay === 'evening' ? 1 : 0);
    row.push(obs.features.topicPosition);
    row.push(obs.features.minutesIntoSession);
    row.push(obs.features.daysSinceLastStudy);
    row.push(obs.features.priorLevel);

    // Interaction: stress × complexity
    const complexityNum = complexityMap[obs.features.complexity] ?? 0.5;
    row.push(obs.features.stressLevel * complexityNum);

    // Confounders
    row.push(obs.confounders.onSSRI ? 1 : 0);
    row.push(obs.confounders.smoker ? 1 : 0);
    row.push(obs.confounders.bmiCategory === 'overweight' ? 1 : 0);
    row.push(obs.confounders.bmiCategory === 'obese' ? 1 : 0);

    X.push(row);
    y.push(computeLearningScore(obs));
    W.push(temporalWeight(obs.timestamp, now));
  }

  return { X, y, W, colNames };
}

// ── Main analysis ─────────────────────────────────────────────

export function runAnalysis(observations: Observation[]): RegressionResult {
  const n = observations.length;

  if (n < 15) {
    return {
      status: 'collecting_data',
      observationsNeeded: 15 - n,
      message: `Need ${15 - n} more observations to fit initial model`,
    };
  }

  try {
    const { X, y, W, colNames } = buildDesignMatrix(observations);
    const p = colNames.length;

    if (n <= p) {
      return {
        status: 'collecting_data',
        observationsNeeded: p + 1 - n,
        message: 'Not enough observations relative to predictors',
      };
    }

    // Apply temporal weights: W^0.5 * X and W^0.5 * y (weighted least squares)
    const sqrtW = W.map(w => Math.sqrt(w));
    const Xw: Matrix = X.map((row, i) => row.map(v => v * sqrtW[i]));
    const yw: Vector = y.map((v, i) => v * sqrtW[i]);

    const Xt = transpose(Xw);
    const XtX = matMul(Xt, Xw);

    // Ridge regularization: add λI to XtX (skip intercept)
    for (let j = 0; j < p; j++) {
      XtX[j][j] += j === 0 ? 0 : RIDGE_LAMBDA;
    }

    const XtXinv = invertMatrix(XtX);

    if (!XtXinv) {
      return { status: 'error', message: 'Matrix is singular – try more diverse study data' };
    }

    const Xty = matVecMul(Xt, yw);
    const beta = matVecMul(XtXinv, Xty);

    // Residuals and R² (computed on unweighted data for interpretability)
    const yHat = matVecMul(X, beta);
    const yMean = y.reduce((s, v) => s + v, 0) / n;
    const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
    const ssRes = y.reduce((s, v, i) => s + (v - yHat[i]) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    const adjR2 = 1 - (1 - r2) * (n - 1) / (n - p - 1);

    // Standard errors
    const sigma2 = ssRes / (n - p);
    const coefficients: RegressionResult['coefficients'] = {};

    for (let j = 0; j < p; j++) {
      const se = Math.sqrt(Math.abs(sigma2 * XtXinv[j][j]));
      const tStat = se > 0 ? beta[j] / se : 0;
      const pVal = tDistSF(Math.abs(tStat), n - p);
      const isStyle = colNames[j].startsWith('style_');
      const isConfounder = ['onSSRI', 'smoker', 'bmi_overweight', 'bmi_obese'].includes(colNames[j]);

      coefficients[colNames[j]] = {
        beta: beta[j],
        std_error: se,
        t_stat: tStat,
        p_value: pVal,
        significant: pVal < 0.05,
        isConfounder,
      };
      void isStyle;
    }

    // Style ranking (include baseline)
    const styleRanking: { style: string; beta: number; significant: boolean }[] = [
      { style: BASELINE_STYLE, beta: 0, significant: false },
    ];

    for (const s of ALL_STYLES.filter(s => s !== BASELINE_STYLE)) {
      const key = `style_${s}`;
      const coef = coefficients[key];
      if (coef) {
        styleRanking.push({ style: s, beta: coef.beta, significant: coef.significant });
      }
    }

    styleRanking.sort((a, b) => b.beta - a.beta);
    const bestStyle = styleRanking[0].style;

    let status: RegressionResult['status'] = 'collecting_data';
    if (n >= 50) status = 'mature';
    else if (n >= 30) status = 'refined';
    else if (n >= 15) status = 'initial_model';

    return {
      status,
      r_squared: r2,
      adjusted_r_squared: adjR2,
      n_observations: n,
      coefficients,
      recommendations: { bestStyle, styleRanking },
      message: `Model fitted on ${n} observations (R²=${r2.toFixed(3)})`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: `Regression failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// Track per-style observation counts for adaptive learning rate
const styleObsCounts: Record<string, number> = {};

/**
 * Online style preference update (bandit-style reward).
 *
 * Improvements over v1:
 * - Adaptive learning rate: starts high (0.3) for new styles, decays to 0.05
 *   as confidence grows. Follows 1/sqrt(n) schedule.
 * - Richer reward signal: factors in response latency on a gradient
 *   rather than binary fast/slow cutoff.
 * - Exploration bonus: styles with few observations get a slight boost
 *   to encourage exploration before exploitation.
 */
export function updateStylePreferences(
  prefs: Record<string, number>,
  style: string,
  correct: boolean,
  latencyMs: number,
): Record<string, number> {
  const updated = { ...prefs };

  // Adaptive learning rate: 0.3 / sqrt(count) clamped to [0.05, 0.3]
  styleObsCounts[style] = (styleObsCounts[style] ?? 0) + 1;
  const count = styleObsCounts[style];
  const lr = Math.max(0.05, Math.min(0.3, 0.3 / Math.sqrt(count)));

  // Gradient reward based on latency (not binary)
  let reward: number;
  if (correct) {
    // Fast (<3s) = 1.0, medium (3-8s) = 0.7, slow (8-15s) = 0.4, very slow = 0.2
    const seconds = latencyMs / 1000;
    if (seconds < 3) reward = 1.0;
    else if (seconds < 8) reward = 0.7;
    else if (seconds < 15) reward = 0.4;
    else reward = 0.2;
  } else {
    reward = -0.3;
  }

  const current = updated[style] ?? 0.5;
  updated[style] = Math.max(0, Math.min(1, current + lr * (reward - current)));

  // Exploration bonus: styles tried < 3 times get a slight uplift
  // to prevent premature convergence on a single style
  for (const [s, pref] of Object.entries(updated)) {
    const obs = styleObsCounts[s] ?? 0;
    if (obs < 3 && pref < 0.5) {
      updated[s] = Math.min(0.5, pref + 0.02);
    }
  }

  return updated;
}
