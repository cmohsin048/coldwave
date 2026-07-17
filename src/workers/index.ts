/**
 * ColdWave worker process. Run separately from the Next.js app:
 *   npm run worker
 *
 * Attaches BullMQ processors to every queue and installs the repeatable
 * (cron-like) jobs. Keep this process running alongside `next start`.
 */
import "dotenv/config";
import { Worker } from "bullmq";
import { createRedisConnection } from "@/lib/redis";
import { QUEUE_NAMES, installRepeatableJobs, type SendStepJob } from "@/queues/queues";
import { tickDueEnrollments, processEnrollmentStep } from "@/modules/campaigns/scheduler";
import { runWarmupTick } from "@/modules/warmup/engine";
import { syncReplies, runWarmupInboxBots } from "@/modules/warmup/imap";
import { refreshAllDomainHealth } from "@/modules/spam/domain-refresh";
import { reportUsageToStripe } from "@/modules/billing/stripe";
import { logger } from "@/lib/logger";

const connection = createRedisConnection();
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

function startWorkers() {
  const workers: Worker[] = [];

  workers.push(
    new Worker(
      QUEUE_NAMES.campaignTick,
      async () => {
        const n = await tickDueEnrollments();
        logger.info("campaign tick", { enqueued: n });
      },
      { connection }
    )
  );

  workers.push(
    new Worker<SendStepJob>(
      QUEUE_NAMES.sendStep,
      async (job) => {
        await processEnrollmentStep(job.data.enrollmentId);
      },
      { connection, concurrency }
    )
  );

  workers.push(
    new Worker(
      QUEUE_NAMES.warmupTick,
      async () => {
        const res = await runWarmupTick();
        // Peer inbox bots: rescue warmup mail from Spam, mark read, reply.
        const bots = await runWarmupInboxBots();
        logger.info("warmup tick", { ...res, ...bots });
      },
      { connection }
    )
  );

  workers.push(
    new Worker(
      QUEUE_NAMES.replySync,
      async () => {
        const res = await syncReplies();
        logger.info("reply sync", res);
      },
      { connection }
    )
  );

  workers.push(
    new Worker(
      QUEUE_NAMES.domainHealth,
      async () => {
        const n = await refreshAllDomainHealth();
        logger.info("domain health refresh", { domains: n });
      },
      { connection }
    )
  );

  workers.push(
    new Worker(
      QUEUE_NAMES.billingSync,
      async () => {
        const res = await reportUsageToStripe();
        logger.info("billing sync", res);
      },
      { connection }
    )
  );

  for (const w of workers) {
    w.on("failed", (job, err) =>
      logger.error("job failed", {
        queue: w.name,
        jobId: job?.id,
        error: err.message,
      })
    );
  }

  return workers;
}

async function main() {
  const workers = startWorkers();
  await installRepeatableJobs();
  logger.info("ColdWave workers started", {
    queues: Object.values(QUEUE_NAMES),
  });

  const shutdown = async () => {
    logger.info("shutting down workers");
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("worker bootstrap failed", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
