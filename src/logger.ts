/**
 * Structured logger with ring buffer + SSE broadcast.
 */

export type LogLevel = "info" | "warn" | "error" | "debug";
export type LogCategory = "poll" | "ack" | "spawn" | "heartbeat" | "session" | "sandbox" | "system" | "api";

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  meta?: Record<string, unknown>;
}

const MAX_ENTRIES = 5000;
const buffer: LogEntry[] = [];
const listeners: Set<(entry: LogEntry) => void> = new Set();
let seq = 0;

export function log(
  level: LogLevel,
  category: LogCategory,
  message: string,
  meta?: Record<string, unknown>,
): LogEntry {
  const entry: LogEntry = { id: ++seq, ts: Date.now(), level, category, message, meta };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();

  const tag = `[${new Date(entry.ts).toISOString().slice(11, 19)}][${category.padEnd(9)}]`;
  if (level === "error") console.error(tag, message, meta ? JSON.stringify(meta) : "");
  else if (level === "warn") console.warn(tag, message, meta ? JSON.stringify(meta) : "");
  else console.log(tag, message, meta ? JSON.stringify(meta) : "");

  for (const fn of listeners) {
    try { fn(entry); } catch {}
  }
  return entry;
}

export function getLogs(since?: number, category?: string, level?: string, limit = 500): LogEntry[] {
  let result = buffer;
  if (since) result = result.filter((e) => e.id > since);
  if (category) result = result.filter((e) => e.category === category);
  if (level) result = result.filter((e) => e.level === level);
  return result.slice(-limit);
}

export function subscribe(fn: (entry: LogEntry) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
