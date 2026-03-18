# Adaptive Learning

ML-driven biometric-adaptive spaced repetition for Even G2 smart glasses.

## What it does

An adaptive flashcard study system that runs on Even G2 smart glasses. It uses biometric z-scores (HRV, SpO2, heart rate) and self-reported state to personalize:

- **Card scheduling** — SM-2+ algorithm with biometric interval modifiers
- **Presentation style** — 11 explanation styles (analogy, mnemonic, Socratic, etc.) selected via ridge regression + bandit learning
- **Session management** — auto-adjusts session length based on cognitive load and stress

## Key features

- Ridge-regularized OLS regression for style preference learning
- Temporal decay weighting (14-day half-life) for evolving preferences
- Stress × complexity interaction modeling
- Adaptive bandit learning rate (0.3/√n) with exploration bonus
- Connection error recovery with exponential backoff reconnection
- Z-score biometric modifiers from personal 7-day baseline

## Tech stack

- TypeScript + Vite
- Even G2 SDK (`@evenrealities/even_hub_sdk`)
- Pure TypeScript matrix math (zero ML dependencies)
- localStorage persistence (no IndexedDB on G2)

## Running

```bash
npm install
npm run dev
```

## Author

Jose Eduardo Praiz Mendez
