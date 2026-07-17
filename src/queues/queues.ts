import { Queue } from "bullmq";
import { createRedisConnection } from "@/lib/redis";

/**
 * BullMQ queue definitions. Queues are created lazily so importing this module
 * in a Server Action (to enqueue) doesn't spin up worker connections. The
 * worker process (src/workers) attaches processors to these same names.
 */

export const QUEUE_NAMES = {
  campaignTick: "campaign-tick", // repeatable: scan for due enrollments
  sendStep: "send-step", // per-enrollment send job
  warmupTick: "warmup-tick", // repeatable: run warmup rounds
  replySync: "reply-sync", // repeatable: IMAP reply detection
  domainHealth: "domain-health", // repeatable: refresh SPF/DKIM/DMARC/blacklist
  billingSync: "billing-sync", // repeatable: report usage to Stripe
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const connection = createRedisConnection();

function makeQueue(name: string) {
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

export const campaignTickQueue = makeQueue(QUEUE_NAMES.campaignTick);
export const sendStepQueue = makeQueue(QUEUE_NAMES.sendStep);
export const warmupTickQueue = makeQueue(QUEUE_NAMES.warmupTick);
export const replySyncQueue = makeQueue(QUEUE_NAMES.replySync);
export const domainHealthQueue = makeQueue(QUEUE_NAMES.domainHealth);
export const billingSyncQueue = makeQueue(QUEUE_NAMES.billingSync);

export interface SendStepJob {
  enrollmentId: string;
}

/** Enqueue a single enrollment's next step (used by the tick + manual actions). */
export async function enqueueSendStep(enrollmentId: string, delayMs = 0) {
  await sendStepQueue.add(
    "send",
    { enrollmentId } satisfies SendStepJob,
    { delay: delayMs, jobId: `send:${enrollmentId}` }
  );
}

/**
 * Install repeatable (cron-like) jobs. Call once from the worker bootstrap.
 * BullMQ dedupes repeatables by name+pattern so this is idempotent.
 */
export async function installRepeatableJobs() {
  await campaignTickQueue.add(
    "tick",
    {},
    { repeat: { every: 60_000 }, jobId: "campaign-tick" } // every minute
  );
  await warmupTickQueue.add(
    "tick",
    {},
    { repeat: { every: 15 * 60_000 }, jobId: "warmup-tick" } // every 15 min
  );
  await replySyncQueue.add(
    "sync",
    {},
    { repeat: { every: 5 * 60_000 }, jobId: "reply-sync" } // every 5 min
  );
  await domainHealthQueue.add(
    "refresh",
    {},
    { repeat: { every: 6 * 60 * 60_000 }, jobId: "domain-health" } // every 6h
  );
  await billingSyncQueue.add(
    "sync",
    {},
    { repeat: { pattern: "0 * * * *" }, jobId: "billing-sync" } // hourly
  );
}
