// ============================================================
// BioLoop G2 — Glasses Display Renderer
// Renders to Even G2 576×288 display via SDK containers
// ============================================================

import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
} from '@evenrealities/even_hub_sdk';
import { state, getBridge, BIO_OPTIONS, RATING_OPTIONS } from './state';
import { log } from './log';

// ── Container helpers ────────────────────────────────────────

function textContainer(
  id: number,
  name: string,
  content: string,
  x: number,
  y: number,
  w: number,
  h: number,
  isEvt = false,
): TextContainerProperty {
  return new TextContainerProperty({
    containerID: id,
    containerName: name,
    content: content.slice(0, 1000),
    xPosition: x,
    yPosition: y,
    width: w,
    height: h,
    isEventCapture: isEvt ? 1 : 0,
    paddingLength: 4,
    borderWidth: 0,
    borderColor: 0,
    borderRdaius: 0,
  });
}

function listContainer(
  id: number,
  name: string,
  items: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  isEvt = false,
): ListContainerProperty {
  return new ListContainerProperty({
    containerID: id,
    containerName: name,
    xPosition: x,
    yPosition: y,
    width: w,
    height: h,
    isEventCapture: isEvt ? 1 : 0,
    paddingLength: 4,
    borderWidth: 0,
    borderColor: 0,
    borderRdaius: 0,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemWidth: 0,
      isItemSelectBorderEn: 1,
      itemName: items,
    }),
  });
}

// ── Page rebuild ─────────────────────────────────────────────

interface PageConfig {
  textObject?: TextContainerProperty[];
  listObject?: ListContainerProperty[];
}

async function rebuildPage(config: PageConfig): Promise<void> {
  const bridge = getBridge();
  const totalContainers =
    (config.textObject?.length ?? 0) + (config.listObject?.length ?? 0);

  const payload = {
    containerTotalNum: totalContainers,
    textObject: config.textObject ?? [],
    listObject: config.listObject ?? [],
  };

  if (!state.startupRendered) {
    await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer(payload),
    );
    state.startupRendered = true;
  } else {
    await bridge.rebuildPageContainer(new RebuildPageContainer(payload));
  }
}

// ── Screen builders ──────────────────────────────────────────

function buildDashboard(): PageConfig {
  const title = 'BioLoop';
  const body = [
    state.deckName || 'No deck loaded',
    '',
    `Cards due: ${state.cardsDue}`,
    `Model: ${state.modelStatus}`,
    `Observations: ${state.obsCount}`,
  ].join('\n');
  const hint = 'Click \u2192 Start session';

  return {
    textObject: [
      textContainer(99, 'evt', ' ', 0, 0, 1, 1, true),
      textContainer(1, 'title', title, 0, 6, 576, 36),
      textContainer(2, 'body', body, 0, 44, 576, 200),
      textContainer(3, 'hint', hint, 0, 252, 576, 32),
    ],
  };
}

function buildBioScreen(
  label: string,
  options: readonly string[],
  selectedIdx: number,
): PageConfig {
  const title = `Pre-session: ${label}`;
  const lines = options.map(
    (opt, i) => (i === selectedIdx ? '\u25B6 ' : '  ') + opt,
  );
  const body = lines.join('\n');
  const hint = 'Up/Down \u2192 select, Click \u2192 confirm';

  return {
    textObject: [
      textContainer(99, 'evt', ' ', 0, 0, 1, 1, true),
      textContainer(1, 'title', title, 0, 6, 576, 36),
      textContainer(2, 'body', body, 0, 44, 576, 200),
      textContainer(3, 'hint', hint, 0, 252, 576, 32),
    ],
  };
}

function buildQuestion(): PageConfig {
  const title = `Card ${state.cardNumber}/${state.totalCards}`;
  const body = state.questionText;
  const hint = 'Click \u2192 Show answer';

  return {
    textObject: [
      textContainer(99, 'evt', ' ', 0, 0, 1, 1, true),
      textContainer(1, 'title', title, 0, 6, 576, 36),
      textContainer(2, 'body', body, 0, 44, 576, 200),
      textContainer(3, 'hint', hint, 0, 252, 576, 32),
    ],
  };
}

function buildAnswer(): PageConfig {
  const title = `Answer ${state.cardNumber}/${state.totalCards}`;
  const body = state.answerText;
  const hint = 'Click \u2192 Rate';

  return {
    textObject: [
      textContainer(99, 'evt', ' ', 0, 0, 1, 1, true),
      textContainer(1, 'title', title, 0, 6, 576, 36),
      textContainer(2, 'body', body, 0, 44, 576, 200),
      textContainer(3, 'hint', hint, 0, 252, 576, 32),
    ],
  };
}

function buildRating(): PageConfig {
  const title = 'Rate your recall';
  const items = RATING_OPTIONS.map(
    (r) => r.charAt(0).toUpperCase() + r.slice(1),
  );
  const hint = 'Scroll \u2192 select, Click \u2192 confirm';

  return {
    textObject: [
      textContainer(1, 'title', title, 0, 6, 576, 36),
      textContainer(3, 'hint', hint, 0, 252, 576, 32),
    ],
    listObject: [
      listContainer(2, 'ratings', items, 0, 44, 576, 200, true),
    ],
  };
}

function buildSummary(): PageConfig {
  const title = 'Session Complete';
  const body = state.summaryText;
  const hint = 'Click \u2192 Dashboard';

  return {
    textObject: [
      textContainer(99, 'evt', ' ', 0, 0, 1, 1, true),
      textContainer(1, 'title', title, 0, 6, 576, 36),
      textContainer(2, 'body', body, 0, 44, 576, 200),
      textContainer(3, 'hint', hint, 0, 252, 576, 32),
    ],
  };
}

// ── Public API ───────────────────────────────────────────────

const SCREEN_BUILDERS: Record<string, () => PageConfig> = {
  dashboard: buildDashboard,
  bio_sleep: () => buildBioScreen('Sleep quality', BIO_OPTIONS, state.bioSleepIdx),
  bio_stress: () => buildBioScreen('Stress level', BIO_OPTIONS, state.bioStressIdx),
  bio_load: () => buildBioScreen('Cognitive load', BIO_OPTIONS, state.bioLoadIdx),
  bio_confirm: () => ({
    textObject: [
      textContainer(99, 'evt', ' ', 0, 0, 1, 1, true),
      textContainer(1, 'title', 'Ready to study?', 0, 6, 576, 36),
      textContainer(2, 'body', [
        `Sleep: ${BIO_OPTIONS[state.bioSleepIdx]}`,
        `Stress: ${BIO_OPTIONS[state.bioStressIdx]}`,
        `Load: ${BIO_OPTIONS[state.bioLoadIdx]}`,
        '',
        'Click to start session',
      ].join('\n'), 0, 44, 576, 200),
      textContainer(3, 'hint', 'Click \u2192 Begin', 0, 252, 576, 32),
    ],
  }),
  question: buildQuestion,
  answer: buildAnswer,
  rating: buildRating,
  summary: buildSummary,
};

export async function showScreen(): Promise<void> {
  const builder = SCREEN_BUILDERS[state.screen];
  if (!builder) {
    log(`Unknown screen: ${state.screen}`);
    return;
  }
  const config = builder();
  log(`Rendering: ${state.screen}`);
  await rebuildPage(config);
}
