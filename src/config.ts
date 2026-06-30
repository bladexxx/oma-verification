/**
 * Configuration from environment variables.
 */

import { resolve } from "node:path";

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  // Anthropic - worker auth (for poll/ack/heartbeat)
  envId: required("ANTHROPIC_ENVIRONMENT_ID"),
  envKey: required("ANTHROPIC_ENVIRONMENT_KEY"),
  // Anthropic - user auth (for session creation, event listing)
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  baseUrl: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
  beta: "managed-agents-2026-04-01",

  // Openshell / sandbox
  gateway: process.env.OPENSHELL_GATEWAY ?? "local",
  image: process.env.ANT_IMAGE ?? `ant-worker:${process.env.ANT_VERSION ?? "1.9.2"}`,
  antVersion: process.env.ANT_VERSION ?? "1.9.2",
  policyFile: resolve(process.env.SANDBOX_POLICY_FILE ?? "./docker/base-policy.yaml"),

  // Server
  port: parseInt(process.env.PORT ?? "7890", 10),
} as const;
