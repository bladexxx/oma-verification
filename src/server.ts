/**
 * Hono app — serves API routes + dashboard.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { api } from "./api.js";
import { DASHBOARD_HTML } from "./dashboard.js";

export const app = new Hono();

app.use("/*", cors());

// API routes under /api
app.route("/api", api);

// Dashboard
app.get("/", (c) => c.html(DASHBOARD_HTML));
