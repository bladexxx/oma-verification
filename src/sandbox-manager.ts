import { log } from "./logger.js";

export function startSessionSandbox(sessionId: string): string {
  log("info", "sandbox", `OpenMA subprocess mode is handled by the OpenMA server for session ${sessionId}`);
  return sessionId;
}
