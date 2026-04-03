import { getAppIdentity, loadMonorepoEnv } from "@re/app-config";
import { createDb } from "@re/db";
import { createEventsWorker } from "@re/queue";
import { processEventById } from "./process-event.js";

loadMonorepoEnv(import.meta.url);

const app = getAppIdentity();
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error(`[${app.id}] DATABASE_URL obrigatória para o worker.`);
  process.exit(1);
}

if (!process.env.REDIS_URL?.trim()) {
  console.error(`[${app.id}] REDIS_URL obrigatória para o worker.`);
  process.exit(1);
}

const db = createDb(databaseUrl);

const worker = createEventsWorker(async ({ eventId }) => {
  await processEventById(db, eventId);
});

worker.on("failed", (job, err) => {
  console.error(`[${app.id}] job falhou`, job?.id, err);
});

worker.on("completed", (job) => {
  console.info(`[${app.id}] evento processado`, job.id);
});

const shutdown = async () => {
  await worker.close();
  process.exit(0);
};

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void shutdown();
  });
}

console.info(`[${app.id}] worker escutando fila (${app.displayName})`);
