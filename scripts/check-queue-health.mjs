import { config } from "dotenv";
import { Queue } from "bullmq";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

const redisUrl = process.env.REDIS_URL?.trim();
if (!redisUrl) {
  console.error("REDIS_URL ausente.");
  process.exit(1);
}

const queue = new Queue("events-process", { connection: { url: redisUrl } });

try {
  const counts = await queue.getJobCounts(
    "active",
    "waiting",
    "delayed",
    "failed",
    "completed",
    "paused",
  );

  const result = {
    ok: true,
    queue: "events-process",
    counts,
    healthy: (counts.failed ?? 0) < 1000,
  };
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("QUEUE_HEALTH_FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await queue.close();
}
