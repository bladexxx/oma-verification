/**
 * Sandbox lifecycle tracker.
 * Tracks all spawned sandboxes and their status.
 */

import { log } from "./logger.js";

export type SandboxStatus = "spawning" | "running" | "exited" | "failed";

export interface SandboxRecord {
  id: string;
  name: string;
  sessionId: string;
  workId: string;
  agentId?: string;
  agentName?: string;
  model?: string;
  status: SandboxStatus;
  pid?: number;
  createdAt: number;
  exitedAt?: number;
  exitCode?: number;
  stdout: string;
  stderr: string;
}

const sandboxes: Map<string, SandboxRecord> = new Map();

export function createRecord(sessionId: string, workId: string, name: string): SandboxRecord {
  const record: SandboxRecord = {
    id: `sb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    sessionId,
    workId,
    status: "spawning",
    createdAt: Date.now(),
    stdout: "",
    stderr: "",
  };
  sandboxes.set(record.id, record);
  log("info", "sandbox", `Record created: ${name}`, { id: record.id, sessionId });
  return record;
}

export function updateRecord(id: string, update: Partial<SandboxRecord>): void {
  const rec = sandboxes.get(id);
  if (rec) Object.assign(rec, update);
}

export function getRecord(id: string): SandboxRecord | undefined {
  return sandboxes.get(id);
}

export function listRecords(): SandboxRecord[] {
  return [...sandboxes.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function getStats(): { total: number; running: number; failed: number; exited: number } {
  const all = [...sandboxes.values()];
  return {
    total: all.length,
    running: all.filter((s) => s.status === "running" || s.status === "spawning").length,
    failed: all.filter((s) => s.status === "failed").length,
    exited: all.filter((s) => s.status === "exited").length,
  };
}

export function deleteRecord(id: string): boolean {
  return sandboxes.delete(id);
}

export function clearExitedRecords(): number {
  let count = 0;
  for (const [id, rec] of sandboxes) {
    if (rec.status === "exited" || rec.status === "failed") {
      sandboxes.delete(id);
      count++;
    }
  }
  log("info", "sandbox", `Cleared ${count} exited/failed records`);
  return count;
}
