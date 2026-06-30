import Anthropic from "@anthropic-ai/sdk";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const baseUrl = process.env.OPENMA_BASE_URL ?? process.env.ANTHROPIC_BASE_URL ?? "http://127.0.0.1:8080";
  const apiKey = process.env.OPENMA_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "";
  const envId = process.env.OPENMA_ENVIRONMENT_ID ?? process.env.ANTHROPIC_ENVIRONMENT_ID ?? "";
  const envKey = process.env.OPENMA_ENVIRONMENT_KEY ?? process.env.ANTHROPIC_ENVIRONMENT_KEY ?? "";

  if (!apiKey) throw new Error("OPENMA_API_KEY or ANTHROPIC_API_KEY is required");
  if (!envId) throw new Error("OPENMA_ENVIRONMENT_ID or ANTHROPIC_ENVIRONMENT_ID is required");
  if (!envKey) throw new Error("OPENMA_ENVIRONMENT_KEY or ANTHROPIC_ENVIRONMENT_KEY is required");

  const client = new Anthropic({ apiKey, baseURL: baseUrl });
  const workClient = new Anthropic({ authToken: envKey, baseURL: baseUrl });
  const beta = "managed-agents-2026-04-01" as const;

  console.log(`[openma-console] baseUrl=${baseUrl}`);
  console.log(`[openma-console] envId=${envId}`);

  try {
    const agents = [] as Array<unknown>;
    for await (const agent of client.beta.agents.list()) {
      agents.push(agent);
    }
    console.log(`[openma-console] agents=${agents.length}`);
    if (agents.length > 0) {
      console.log(JSON.stringify(agents[0], null, 2));
    }
  } catch (err) {
    console.error(`[openma-console] agents failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const stats = await client.beta.environments.work.stats(envId);
    console.log(`[openma-console] work.stats depth=${stats.depth}`);
  } catch (err) {
    console.error(`[openma-console] work.stats failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const page = await client.beta.environments.work.list(envId, { limit: 1 });
    console.log(`[openma-console] work.list count=${page.data?.length ?? 0}`);
  } catch (err) {
    console.error(`[openma-console] work.list failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const work = await workClient.beta.environments.work.poll(envId, { betas: [beta] });
    console.log(`[openma-console] work.poll ${work ? `id=${work.id}` : "null"}`);
  } catch (err) {
    console.error(`[openma-console] work.poll failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[openma-console] failed: ${msg}`);
  process.exit(1);
});
