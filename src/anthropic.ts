/**
 * Anthropic API client using official SDK.
 *
 * Two clients following the SDK's own pattern (see WorkPoller source):
 * - `client`     → API Key auth for management/session endpoints
 * - `workClient` → Bearer auth (environment key) for work poll/ack/heartbeat/stop
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import type { AnthropicBeta } from "@anthropic-ai/sdk/resources/beta/beta.js";
import { log } from "./logger.js";

/** Management client: sessions, environment listing. */
const client = new Anthropic({
  apiKey: config.apiKey || undefined,
  authToken: null,
});

/** Work client: poll/ack/heartbeat/stop — uses environment key as Bearer. */
const workClient = new Anthropic({
  authToken: config.envKey,
  apiKey: null,
});

const betas: AnthropicBeta[] = [config.beta as AnthropicBeta];
let clientStateLogged = false;

function logClientStateOnce(): void {
  if (clientStateLogged) return;
  clientStateLogged = true;

  const mask = (s: string | null | undefined): string | null => {
    if (!s) return null;
    const t = String(s);
    return `${t.slice(0, 12)}***${t.slice(-4)}`;
  };

  const rawMgmt = client as unknown as { apiKey?: string | null; authToken?: string | null; baseURL?: string };
  const rawWork = workClient as unknown as { apiKey?: string | null; authToken?: string | null; baseURL?: string };

  log("info", "system", "Anthropic clients initialized", {
    management: { apiKey: mask(rawMgmt.apiKey), authToken: mask(rawMgmt.authToken), baseURL: rawMgmt.baseURL },
    work: { apiKey: mask(rawWork.apiKey), authToken: mask(rawWork.authToken), baseURL: rawWork.baseURL },
  });
}

// --- Work queue ---

export interface WorkItem {
  id: string;
  data: { type: string; id: string };
}

function toWorkItem(item: unknown): WorkItem {
  const v = item as { id?: string; data?: { type?: string; id?: string } };
  return {
    id: v.id ?? "",
    data: {
      type: v.data?.type ?? "",
      id: v.data?.id ?? "",
    },
  };
}

export async function pollWork(): Promise<WorkItem | null> {
  logClientStateOnce();
  const work = await workClient.beta.environments.work.poll(config.envId, { betas });
  if (!work) return null;
  return toWorkItem(work);
}

export async function ackWork(workId: string): Promise<void> {
  await workClient.beta.environments.work.ack(workId, {
    environment_id: config.envId,
    betas,
  });
}

export async function heartbeat(workId: string, lastHb?: string): Promise<{ last_heartbeat: string } | null> {
  const res = await workClient.beta.environments.work.heartbeat(workId, {
    environment_id: config.envId,
    expected_last_heartbeat: lastHb,
    betas,
  });
  return { last_heartbeat: res.last_heartbeat };
}

export async function stopWork(workId: string): Promise<void> {
  await workClient.beta.environments.work.stop(workId, {
    environment_id: config.envId,
    betas,
  }).catch((e: unknown) => {
    if (!String(e).includes("409")) throw e;
  });
}

// --- Sessions ---

export interface SessionCreateParams {
  agent: string;
  message?: string;
}

export async function createSession(agentId: string, message?: string): Promise<unknown> {
  const session = await client.beta.sessions.create({
    agent: agentId,
    environment_id: config.envId,
  });

  if (message) {
    await client.beta.sessions.events.send(session.id, {
      events: [{
        type: "user.message",
        content: [{ type: "text", text: message }],
      }],
    });
  }

  return session as unknown;
}

export async function listSessionEvents(sessionId: string, limit = 100): Promise<unknown[]> {
  const result = await client.beta.sessions.events.list(sessionId, { limit });
  return (result.data ?? []) as unknown[];
}

export async function sendSessionEvent(sessionId: string, message: string): Promise<void> {
  await client.beta.sessions.events.send(sessionId, {
    events: [{
      type: "user.message",
      content: [{ type: "text", text: message }],
    }],
  });
}

export async function getSession(sessionId: string): Promise<unknown> {
  return (await client.beta.sessions.retrieve(sessionId)) as unknown;
}

// --- Agents ---

export async function getAgent(agentId: string): Promise<unknown> {
  return (await client.beta.agents.retrieve(agentId)) as unknown;
}

export async function listAgents(): Promise<unknown[]> {
  const result: unknown[] = [];
  for await (const agent of client.beta.agents.list()) {
    result.push(agent);
  }
  return result;
}

export async function createAgent(params: Record<string, unknown>): Promise<unknown> {
  // params is already validated/transformed by the caller (api.ts)
  return (await client.beta.agents.create(params as never)) as unknown;
}

export async function updateAgent(agentId: string, params: Record<string, unknown>): Promise<unknown> {
  // params must include `version` for optimistic concurrency
  return (await client.beta.agents.update(agentId, params as never)) as unknown;
}

export async function listSessions(agentId?: string, limit = 50): Promise<unknown[]> {
  const params: Record<string, unknown> = { limit };
  if (agentId) params.agent_id = agentId;
  const result: unknown[] = [];
  for await (const session of client.beta.sessions.list(params as never)) {
    result.push(session);
    if (result.length >= limit) break;
  }
  return result;
}
