import { spawn as cpSpawn, execSync } from "node:child_process";
import { config } from "./config.js";
import { log } from "./logger.js";
import { createRecord, updateRecord } from "./sandbox-tracker.js";

const activeSandboxes = new Set<string>();

export function isSubprocessSandboxMode(): boolean {
  return config.sandboxMode === "openma-subprocess";
}

async function resolveAgentInfo(sessionId: string, recordId: string): Promise<void> {
  try {
    const session = (await import("./anthropic.js")).getSession(sessionId) as Promise<{
      agent?: { id?: string; name?: string; model?: { id?: string } };
    }>;
    const resolved = await session;
    if (resolved?.agent) {
      updateRecord(recordId, {
        agentId: resolved.agent.id ?? undefined,
        agentName: resolved.agent.name ?? undefined,
        model: resolved.agent.model?.id ?? undefined,
      });
      log("info", "spawn", `Agent resolved: ${resolved.agent.name ?? resolved.agent.id} (${resolved.agent.model?.id})`, { recordId });
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

export function spawnSandboxForSession(sessionId: string, workId: string): string {
  const sandboxName = `ant-${sessionId.slice(0, 8)}`;

  if (activeSandboxes.has(sandboxName)) {
    log("info", "spawn", `Sandbox already active (in-memory): ${sandboxName}, skipping`);
    return sandboxName;
  }

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

  const antLines: string[] = [
    "set -e",
    "mkdir -p $HOME/workspace",
    `export ANTHROPIC_SESSION_ID="${sessionId}"`,
  ];
  if (config.envKey && config.envKey.length > 0) {
    antLines.push(`export ANTHROPIC_ENVIRONMENT_KEY="${config.envKey}"`);
  }
  antLines.push(
    `export ANTHROPIC_WORK_ID="${workId}"`,
    `export ANTHROPIC_ENVIRONMENT_ID="${config.envId}"`,
    `export ANTHROPIC_BASE_URL="${config.baseUrl}"`,
    "ant beta:worker run --workdir $HOME/workspace",
  );
  const antCmd = antLines.join("; ");

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
    ANTHROPIC_API_KEY: config.apiKey,
    ANTHROPIC_ENVIRONMENT_ID: config.envId,
    ANTHROPIC_BASE_URL: config.baseUrl,
  };
  if (config.envKey && config.envKey.length > 0) {
    env.ANTHROPIC_ENVIRONMENT_KEY = config.envKey;
  }

  log("info", "spawn", `Spawning ${config.sandboxMode}: ${sandboxName}`, { sessionId, workId, image: config.image, sandboxMode: config.sandboxMode });

  const child = cpSpawn("openshell", args, { env, stdio: ["ignore", "pipe", "pipe"] });

  updateRecord(record.id, { pid: child.pid, status: "running" });
  void resolveAgentInfo(sessionId, record.id);

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    record.stdout += text;
    if (record.stdout.length > 10240) record.stdout = record.stdout.slice(-8192);
    log("debug", "sandbox", `[${sandboxName}] stdout: ${text.trim().slice(0, 200)}`);
  });

  child.stderr?.on("data", (chunk: Buffer) => {
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

  return sandboxName;
}

export function startSessionSandbox(sessionId: string): string {
  if (!isSubprocessSandboxMode()) {
    log("debug", "sandbox", `Skipping session sandbox bootstrap for ${config.sandboxMode}`);
    return "";
  }
  return spawnSandboxForSession(sessionId, `openma-${Date.now()}`);
}
