/**
 * Configuration from environment variables.
 */

import { resolve } from "node:path";

function requiredAny(names: readonly string[]): string {
  const val = names.map((name) => process.env[name]).find((value) => typeof value === "string" && value.trim().length > 0);
  if (!val) throw new Error(`Missing required env var: one of ${names.join(", ")}`);
  return val;
}

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  provider: "openma",
  // OpenMA worker auth (for local subprocess mode):
  // Environment ID is required for OpenMA; this project is OpenMA-only.
  envId: required("OPENMA_ENVIRONMENT_ID"),
  envKey: process.env.OPENMA_ENVIRONMENT_KEY ?? process.env.ANTHROPIC_ENVIRONMENT_KEY ?? "",
  // OpenMA / Anthropic-compatible user auth (for session creation, event listing)
  apiKey: process.env.OPENMA_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "",
  baseUrl: process.env.OPENMA_BASE_URL ?? process.env.ANTHROPIC_BASE_URL ?? "http://127.0.0.1:8080",
  beta: process.env.OPENMA_BETA ?? process.env.ANTHROPIC_BETA ?? "managed-agents-2026-04-01",

  // Openshell / sandbox
  gateway: process.env.OPENSHELL_GATEWAY ?? "local",
  image: process.env.ANT_IMAGE ?? `ant-worker:${process.env.ANT_VERSION ?? "1.9.2"}`,
  antVersion: process.env.ANT_VERSION ?? "1.9.2",
  policyFile: resolve(process.env.SANDBOX_POLICY_FILE ?? "./docker/base-policy.yaml"),
  sandboxMode: "openma-subprocess" as const,

  // Server
  port: parseInt(process.env.PORT ?? "7890", 10),
} as const;
