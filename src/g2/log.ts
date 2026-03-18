// ============================================================
// Adaptive Learning G2 — Event Logging
// Logs to console and browser panel
// ============================================================

const MAX_LOG_LINES = 50;
const logLines: string[] = [];

export function log(msg: string): void {
  const ts = new Date().toLocaleTimeString();
  const line = `[${ts}] ${msg}`;
  console.log(`[adaptive-learning] ${msg}`);
  logLines.push(line);
  if (logLines.length > MAX_LOG_LINES) logLines.shift();

  const el = document.getElementById('event-log');
  if (el) {
    el.textContent = logLines.join('\n');
    el.scrollTop = el.scrollHeight;
  }
}
