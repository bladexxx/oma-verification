/**
 * Hono API routes — debug endpoints for session management,
 * sandbox lifecycle, and log streaming.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getLogs, subscribe } from "./logger.js";
import { config } from "./config.js";
import { listRecords, getRecord, getStats, deleteRecord, clearExitedRecords } from "./sandbox-tracker.js";
import { createSession, listSessionEvents, getSession, sendSessionEvent, getAgent, listAgents, listSessions, createAgent, updateAgent } from "./anthropic.js";
import { isPollRunning, startPollLoop, stopPollLoop } from "./poll.js";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export const api = new Hono();

// --- Logs ---

api.get("/logs", (c) => {
  const since = c.req.query("since");
  const category = c.req.query("category");
  const level = c.req.query("level");
  const limit = parseInt(c.req.query("limit") ?? "500", 10);
  return c.json(getLogs(since ? parseInt(since, 10) : undefined, category, level, limit));
});

api.get("/logs/stream", (c) => {
  return streamSSE(c, async (stream) => {
    const unsub = subscribe((entry) => {
      stream.writeSSE({ data: JSON.stringify(entry), event: "log" });
    });
    const ping = setInterval(() => {
      stream.writeSSE({ data: "", event: "ping" });
    }, 15000);

    stream.onAbort(() => { unsub(); clearInterval(ping); });
    await new Promise(() => {}); // block forever
  });
});

// --- Poll control ---

api.get("/status", (c) => {
  return c.json({
    polling: isPollRunning(),
    config: {
      provider: config.provider,
      envId: config.envId,
      gateway: config.gateway,
      image: config.image,
      antVersion: config.antVersion,
      baseUrl: config.baseUrl,
      port: config.port,
      hasApiKey: !!config.apiKey,
      hasEnvKey: !!config.envKey,
      sandboxMode: config.sandboxMode,
    },
    sandboxes: getStats(),
  });
});

api.post("/poll/start", (c) => {
  startPollLoop();
  return c.json({ ok: true, polling: true });
});

api.post("/poll/stop", (c) => {
  stopPollLoop();
  return c.json({ ok: true, polling: false });
});

// --- Sandboxes ---

api.get("/sandboxes", (c) => {
  return c.json(listRecords());
});

api.get("/sandboxes/:id", (c) => {
  const rec = getRecord(c.req.param("id"));
  if (!rec) return c.json({ error: "not found" }, 404);
  return c.json(rec);
});

api.delete("/sandboxes/exited", (c) => {
  const count = clearExitedRecords();
  return c.json({ ok: true, cleared: count });
});

api.delete("/sandboxes/:id", (c) => {
  const id = c.req.param("id");
  const rec = getRecord(id);
  if (!rec) return c.json({ error: "not found" }, 404);
  if (rec.status === "running" || rec.status === "spawning") {
    return c.json({ error: "cannot delete running sandbox" }, 400);
  }
  deleteRecord(id);
  return c.json({ ok: true, id });
});

// --- Sessions ---

api.post("/sessions", async (c) => {
  const body = await c.req.json<{ agent: string; message?: string }>();
  if (!body.agent) return c.json({ error: "agent required" }, 400);
  try {
    const session = await createSession(body.agent, body.message);
    return c.json(session);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

api.get("/sessions/:id", async (c) => {
  try {
    const session = await getSession(c.req.param("id"));
    return c.json(session);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

api.get("/sessions/:id/events", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "100", 10);
  try {
    const events = await listSessionEvents(c.req.param("id"), limit);
    return c.json(events);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

api.post("/sessions/:id/events", async (c) => {
  const body = await c.req.json<{ message: string }>();
  if (!body.message) return c.json({ error: "message required" }, 400);
  try {
    await sendSessionEvent(c.req.param("id"), body.message);
    return c.json({ ok: true, sessionId: c.req.param("id") });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// --- Agents ---

api.get("/agents", async (c) => {
  try {
    const agents = await listAgents();
    return c.json(agents);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

api.get("/agents/:id", async (c) => {
  try {
    const agent = await getAgent(c.req.param("id"));
    return c.json(agent);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

api.get("/agents/:id/sessions", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  try {
    const sessions = await listSessions(c.req.param("id"), limit);
    return c.json(sessions);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// --- Agent Creation (YAML) ---

/** Validate required fields for agent creation */
function validateAgentYaml(parsed: unknown): string[] {
  const errors: string[] = [];
  if (!parsed || typeof parsed !== "object") {
    errors.push("YAML must parse to an object");
    return errors;
  }
  const obj = parsed as Record<string, unknown>;
  if (!obj.name || typeof obj.name !== "string" || obj.name.trim().length === 0) {
    errors.push("'name' is required (string, 1-256 chars)");
  } else if (obj.name.length > 256) {
    errors.push("'name' must be 256 characters or fewer");
  }
  if (!obj.model) {
    errors.push("'model' is required (e.g. 'claude-sonnet-4-6' or {id, speed?})");
  }
  if (obj.description && typeof obj.description === "string" && obj.description.length > 2048) {
    errors.push("'description' must be 2048 characters or fewer");
  }
  if (obj.system && typeof obj.system === "string" && obj.system.length > 100000) {
    errors.push("'system' must be 100,000 characters or fewer");
  }
  if (obj.tools !== undefined && !Array.isArray(obj.tools)) {
    errors.push("'tools' must be an array");
  }
  if (obj.mcp_servers !== undefined && !Array.isArray(obj.mcp_servers)) {
    errors.push("'mcp_servers' must be an array");
  }
  if (obj.skills !== undefined && !Array.isArray(obj.skills)) {
    errors.push("'skills' must be an array");
  }
  return errors;
}

api.post("/agents/validate", async (c) => {
  const body = await c.req.json<{ yaml: string }>();
  if (!body.yaml) return c.json({ valid: false, errors: ["No YAML provided"] }, 400);
  try {
    const parsed = parseYaml(body.yaml);
    const errors = validateAgentYaml(parsed);
    if (errors.length > 0) return c.json({ valid: false, errors, parsed });
    return c.json({ valid: true, errors: [], parsed });
  } catch (err) {
    return c.json({ valid: false, errors: ["YAML parse error: " + String(err)] }, 400);
  }
});

api.post("/agents", async (c) => {
  const body = await c.req.json<{ yaml: string }>();
  if (!body.yaml) return c.json({ error: "No YAML provided" }, 400);
  let parsed: unknown;
  try {
    parsed = parseYaml(body.yaml);
  } catch (err) {
    return c.json({ error: "YAML parse error: " + String(err) }, 400);
  }
  const errors = validateAgentYaml(parsed);
  if (errors.length > 0) return c.json({ error: "Validation failed", errors }, 400);
  try {
    const agent = await createAgent(parsed as Record<string, unknown>);
    return c.json(agent);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// --- Agent Edit (YAML export + update) ---

/** Strip read-only / internal fields before exporting to editable YAML */
function agentToEditableFields(agent: Record<string, unknown>): Record<string, unknown> {
  const { id, type, version, created_at, updated_at, archived_at, ...editable } = agent;
  // Remove empty arrays/null for cleaner YAML
  if (Array.isArray(editable.mcp_servers) && editable.mcp_servers.length === 0) delete editable.mcp_servers;
  if (Array.isArray(editable.skills) && editable.skills.length === 0) delete editable.skills;
  if (editable.metadata && typeof editable.metadata === "object" && Object.keys(editable.metadata as object).length === 0) delete editable.metadata;
  if (editable.multiagent === null) delete editable.multiagent;
  if (editable.system === null) delete editable.system;
  if (editable.description === null) delete editable.description;
  return editable;
}

api.get("/agents/:id/yaml", async (c) => {
  try {
    const agent = (await getAgent(c.req.param("id"))) as Record<string, unknown>;
    const editable = agentToEditableFields(agent);
    const yaml = stringifyYaml(editable, { lineWidth: 120 });
    return c.json({ yaml, version: agent.version, id: agent.id, name: agent.name });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

api.put("/agents/:id", async (c) => {
  const agentId = c.req.param("id");
  const body = await c.req.json<{ yaml: string; version: number }>();
  if (!body.yaml) return c.json({ error: "No YAML provided" }, 400);
  if (body.version == null) return c.json({ error: "'version' required for update (optimistic concurrency)" }, 400);
  let parsed: unknown;
  try {
    parsed = parseYaml(body.yaml);
  } catch (err) {
    return c.json({ error: "YAML parse error: " + String(err) }, 400);
  }
  const errors = validateAgentYaml(parsed);
  if (errors.length > 0) return c.json({ error: "Validation failed", errors }, 400);
  try {
    const params = { ...(parsed as Record<string, unknown>), version: body.version };
    const agent = await updateAgent(agentId, params);
    return c.json(agent);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});
