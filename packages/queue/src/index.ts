import { Queue, Worker, type ConnectionOptions } from "bullmq";

export type { Queue, Worker, ConnectionOptions } from "bullmq";

export const EVENTS_QUEUE_NAME = "events-process";

export type ProcessEventJobData = { eventId: string };

export function getRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    throw new Error("REDIS_URL não definida. Suba Redis (ex.: docker compose) e configure o .env.");
  }
  return { url };
}

export function createEventsQueue(): Queue<ProcessEventJobData> {
  return new Queue<ProcessEventJobData>(EVENTS_QUEUE_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

export async function enqueueProcessEvent(
  queue: Queue<ProcessEventJobData>,
  eventId: string,
  opts?: { allowDuplicate?: boolean },
): Promise<void> {
  const allowDuplicate = opts?.allowDuplicate === true;
  await queue.add(
    "process",
    { eventId },
    allowDuplicate ? undefined : { jobId: eventId },
  );
}

export function createEventsWorker(
  processor: (data: ProcessEventJobData) => Promise<void>,
): Worker<ProcessEventJobData> {
  return new Worker<ProcessEventJobData>(
    EVENTS_QUEUE_NAME,
    async (job) => {
      await processor(job.data);
    },
    { connection: getRedisConnection() },
  );
}
