import Anthropic from "@anthropic-ai/sdk";

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }

  const client = new Anthropic({ apiKey });

  console.log("[experiment] listing environments via SDK...");
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
