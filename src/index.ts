/**
 * Entry point — starts Hono server + poll loop.
 */

import { serve } from "@hono/node-server";
import { app } from "./server.js";
import { startPollLoop, stopPollLoop } from "./poll.js";
import { config } from "./config.js";
import { log } from "./logger.js";

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log("info", "system", `Debug UI ready → http://0.0.0.0:${info.port}`);
  log("info", "system", `Config`, {
    gateway: config.gateway,
    image: config.image,
    antVersion: config.antVersion,
  });
});

// OpenMA-only mode does not require the CMA-style poll loop.
startPollLoop();

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log("info", "system", `Received ${sig}, shutting down...`);
    stopPollLoop();
    setTimeout(() => process.exit(0), 500);
  });
}
