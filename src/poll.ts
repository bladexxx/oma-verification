/**
 * Poll loop — polls Anthropic work queue, ACKs, spawns openshell sandboxes.
 * Captures stdout/stderr from child processes into sandbox tracker.
 */

import { log } from "./logger.js";

let running = false;

export async function startPollLoop(): Promise<void> {
  if (running) return;
  running = true;
  log("info", "system", "Poll loop disabled for OpenMA-only mode");
}

export function stopPollLoop(): void {
  running = false;
  log("info", "system", "Poll loop stopped");
}

export function isPollRunning(): boolean {
  return running;
}
