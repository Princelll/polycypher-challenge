// ============================================================
// Adaptive Learning G2 — Display Utilities
// Text helpers, scroll indicators, action bars
// Patterns adapted from even-toolkit (text-utils, action-bar)
// ============================================================

// ── Display constants (G2 hardware) ─────────────────────────

export const DISPLAY_WIDTH = 576;
export const DISPLAY_HEIGHT = 288;

// Approximate chars per line at default monospace size
// G2 uses ~16px wide chars, so 576/16 ≈ 36 chars per line
export const CHARS_PER_LINE = 36;

// Approximate visible lines in the body area (200px height)
// ~20px per line = ~10 visible lines
export const VISIBLE_LINES = 10;

// ── Supported characters ────────────────────────────────────
// G2 only supports: ASCII, full blocks (█), horizontal lines (─)
// NOT supported: ░▒▓, ╔═╗║, ▀▄, emoji, most unicode symbols

/** Separator line using supported horizontal line character */
export function separator(width = CHARS_PER_LINE): string {
  return '\u2500'.repeat(width); // ─ (horizontal line - supported)
}

// ── Text utilities ──────────────────────────────────────────

/** Truncate text to fit display, adding ... if needed */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + '...';
}

/** Truncate per line to avoid horizontal overflow */
export function truncateLines(text: string, maxCharsPerLine = CHARS_PER_LINE): string {
  return text
    .split('\n')
    .map(line => truncate(line, maxCharsPerLine))
    .join('\n');
}

/** Build a centered header line */
export function buildHeaderLine(text: string, width = CHARS_PER_LINE): string {
  if (text.length >= width) return text.slice(0, width);
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text;
}

/**
 * Apply scroll indicators to text content.
 * Shows markers when content extends above/below visible area.
 * Pattern from even-toolkit applyScrollIndicators.
 */
export function applyScrollIndicators(
  lines: string[],
  scrollOffset: number,
  visibleCount = VISIBLE_LINES,
): string {
  const totalLines = lines.length;
  const visible = lines.slice(scrollOffset, scrollOffset + visibleCount);

  // Add up indicator if scrolled down
  if (scrollOffset > 0) {
    visible[0] = '... more above ...';
  }

  // Add down indicator if more below
  if (scrollOffset + visibleCount < totalLines) {
    visible[visible.length - 1] = '... more below ...';
  }

  return visible.join('\n');
}

// ── Action bar builder ──────────────────────────────────────
// Pattern from even-toolkit action-bar module

interface ActionHint {
  gesture: string;  // 'Click', 'Scroll', 'Up/Down', 'Double-tap'
  action: string;   // 'Start', 'Select', 'Back'
}

/**
 * Build a compact action bar hint string for the bottom of the display.
 * Uses colon format since arrows are not supported on G2.
 */
export function buildActionBar(hints: ActionHint[]): string {
  return hints
    .map(h => `${h.gesture}: ${h.action}`)
    .join('  ');
}

/**
 * Word-wrap text to fit within display width.
 * Breaks on spaces to avoid mid-word splits.
 */
export function wordWrap(text: string, maxWidth = CHARS_PER_LINE): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.length <= maxWidth) {
      lines.push(paragraph);
      continue;
    }
    const words = paragraph.split(' ');
    let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}
