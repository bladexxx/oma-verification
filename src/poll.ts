/**
 * Poll loop — polls Anthropic work queue, ACKs, spawns openshell sandboxes.
 * Captures stdout/stderr from child processes into sandbox tracker.
 */

import { spawn as cpSpawn, execSync } from "node:child_process";
import { config } from "./config.js";
import { log } from "./logger.js";
import { pollWork, ackWork, getSession } from "./anthropic.js";
import { createRecord, updateRecord } from "./sandbox-tracker.js";

/** Track active sandbox names to avoid redundant spawns within this process. */
const activeSandboxes = new Set<string>();

/** Resolve agent info from session and attach to sandbox record. */
async function resolveAgentInfo(sessionId: string, recordId: string): Promise<void> {
  try {
    const session = (await getSession(sessionId)) as {
      agent?: { id?: string; name?: string; model?: { id?: string } };
    };
    if (session?.agent) {
      updateRecord(recordId, {
        agentId: session.agent.id ?? undefined,
        agentName: session.agent.name ?? undefined,
        model: session.agent.model?.id ?? undefined,
      });
      log("info", "spawn", `Agent resolved: ${session.agent.name ?? session.agent.id} (${session.agent.model?.id})`, { recordId });
    }
  } catch (err) {
    log("warn", "spawn", `Failed to resolve agent info for session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function sandboxExists(name: string): boolean {
  try {
    execSync(`openshell sandbox get ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function spawnSandbox(sessionId: string, workId: string): void {
  const sandboxName = `ant-${sessionId.slice(0, 8)}`;

  // Skip if actively running in THIS process (same work item being processed)
  if (activeSandboxes.has(sandboxName)) {
    log("info", "spawn", `Sandbox already active (in-memory): ${sandboxName}, skipping`);
    return;
  }
  // Stale sandbox from previous work item — delete before recreating
  if (sandboxExists(sandboxName)) {
    log("info", "spawn", `Removing stale sandbox: ${sandboxName}`);
    try {
      execSync(`openshell sandbox delete ${sandboxName}`, { stdio: "ignore" });
    } catch {
      log("warn", "spawn", `Failed to delete stale sandbox: ${sandboxName}, proceeding anyway`);
    }
  }

  activeSandboxes.add(sandboxName);
  const record = createRecord(sessionId, workId, sandboxName);

  const antCmd = [
    "set -e",
    "mkdir -p $HOME/workspace",
    `export ANTHROPIC_SESSION_ID="${sessionId}"`,
    `export ANTHROPIC_ENVIRONMENT_KEY="${config.envKey}"`,
    `export ANTHROPIC_WORK_ID="${workId}"`,
    `export ANTHROPIC_ENVIRONMENT_ID="${config.envId}"`,
    `export ANTHROPIC_BASE_URL="${config.baseUrl}"`,
    "ant beta:worker run --workdir $HOME/workspace",
  ].join("; ");

  const args = [
    "sandbox", "create",
    "-g", config.gateway,
    "--name", sandboxName,
    "--from", config.image,
    "--no-keep",
    "--policy", config.policyFile,
    "--",
    "sh", "-c", antCmd,
  ];

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ANTHROPIC_SESSION_ID: sessionId,
    ANTHROPIC_WORK_ID: workId,
    // Use API key (x-api-key) for Anthropic calls in child processes as well.
    ANTHROPIC_API_KEY: config.apiKey,
    ANTHROPIC_ENVIRONMENT_ID: config.envId,
    ANTHROPIC_BASE_URL: config.baseUrl,
  };

  log("info", "spawn", `Spawning: ${sandboxName}`, { sessionId, workId, image: config.image });

  const child = cpSpawn("openshell", args, { env, stdio: ["ignore", "pipe", "pipe"] });

  updateRecord(record.id, { pid: child.pid, status: "running" });

  // Resolve agent info from session (non-blocking)
  resolveAgentInfo(sessionId, record.id).catch(() => {});

  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    record.stdout += text;
    // Keep last 10KB
    if (record.stdout.length > 10240) record.stdout = record.stdout.slice(-8192);
    log("debug", "sandbox", `[${sandboxName}] stdout: ${text.trim().slice(0, 200)}`);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    record.stderr += text;
    if (record.stderr.length > 10240) record.stderr = record.stderr.slice(-8192);
    log("warn", "sandbox", `[${sandboxName}] stderr: ${text.trim().slice(0, 200)}`);
  });

  child.on("exit", (code) => {
    activeSandboxes.delete(sandboxName);
    const status = code === 0 ? "exited" : "failed";
    updateRecord(record.id, { status, exitedAt: Date.now(), exitCode: code ?? -1 });
    log(code === 0 ? "info" : "error", "sandbox", `[${sandboxName}] exited code=${code}`, { id: record.id });
  });

  child.on("error", (err) => {
    activeSandboxes.delete(sandboxName);
    updateRecord(record.id, { status: "failed", exitedAt: Date.now() });
    log("error", "spawn", `[${sandboxName}] spawn error: ${err.message}`);
  });
}

let running = false;

export async function startPollLoop(): Promise<void> {
  if (running) return;
  running = true;
  log("info", "system", "Poll loop started", {
    envId: config.envId,
    gateway: config.gateway,
    image: config.image,
  });

  while (running) {
    try {
      const work = await pollWork();

      if (!work) {
        await sleep(1000 + Math.random() * 2000);
        continue;
      }

      if (work.data.type !== "session") {
        log("debug", "poll", `Skipping non-session work type: ${work.data.type}`);
        continue;
      }

      const sessionId = work.data.id;
      log("info", "poll", `Work received`, { sessionId, workId: work.id });

      await ackWork(work.id);
      log("info", "ack", `ACK sent`, { workId: work.id });

      spawnSandbox(sessionId, work.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("error", "poll", `Error: ${msg}`);
      await sleep(2000 + Math.random() * 3000);
    }
  }
}

export function stopPollLoop(): void {
  running = false;
  log("info", "system", "Poll loop stopped");
}

export function isPollRunning(): boolean {
  return running;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
