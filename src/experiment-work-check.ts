import Anthropic from "@anthropic-ai/sdk";

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const envId = process.env.ANTHROPIC_ENVIRONMENT_ID;

  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
  if (!envId) throw new Error("ANTHROPIC_ENVIRONMENT_ID is required");

  const client = new Anthropic({ apiKey });

  console.log(`[experiment] work-check for env=${envId}`);

  // 1) stats
  try {
    const stats = await client.beta.environments.work.stats(envId);
    console.log(`[work.stats] ok depth=${stats.depth}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[work.stats] failed: ${msg}`);
  }

  // 2) list (first page/first item only)
  try {
    const page = await client.beta.environments.work.list(envId, { limit: 1 });
    const first = page.data?.[0];
    if (first) {
      console.log(`[work.list] ok first.id=${first.id}`);
    } else {
      console.log("[work.list] ok no items");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[work.list] failed: ${msg}`);
  }

  // 3) poll (non-blocking default)
  try {
    const work = await client.beta.environments.work.poll(envId);
    if (work) {
      console.log(`[work.poll] ok id=${work.id}`);
    } else {
      console.log("[work.poll] ok null (no work)");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[work.poll] failed: ${msg}`);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[experiment] failed: ${msg}`);
  process.exit(1);
});
