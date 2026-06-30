import Anthropic from "@anthropic-ai/sdk";

async function main(): Promise<void> {
  const apiKey = process.env.OPENMA_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.OPENMA_BASE_URL ?? process.env.ANTHROPIC_BASE_URL ?? "http://127.0.0.1:8080";
  if (!apiKey) {
    throw new Error("OPENMA_API_KEY or ANTHROPIC_API_KEY is required");
  }

  const client = new Anthropic({ apiKey, baseURL: baseUrl });

  console.log(`[experiment] listing environments via SDK from ${baseUrl}...`);
  let count = 0;
  for await (const env of client.beta.environments.list()) {
    count += 1;
    console.log(`[env] id=${env.id} name=${env.name}`);
  }
  console.log(`[experiment] total=${count}`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[experiment] failed: ${msg}`);
  process.exit(1);
});
