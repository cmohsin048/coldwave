import { and, eq, lte, gte, inArray, asc, desc, sql, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  campaignEnrollments,
  campaigns,
  sequenceSteps,
  messages,
  messageEvents,
  leads,
  type SequenceStep,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { pickMailbox } from "@/modules/sending/pool";
import { sendSequenceStep } from "@/modules/sending/send";
import { enqueueSendStep } from "@/queues/queues";
import { pickVariantForStep } from "./variants";
import { recordStageTransition, recordStageReplyConversion } from "./funnel";
import {
  timezoneForLead,
  isWithinSendWindow,
  nextSendWindow,
} from "./timezone";

/** Flip "scheduled" campaigns live once their scheduled start time arrives. */
async function activateScheduledCampaigns(): Promise<void> {
  await db
    .update(campaigns)
    .set({ status: "active", startedAt: new Date() })
    .where(
      and(
        eq(campaigns.status, "scheduled"),
        isNotNull(campaigns.scheduledStartAt),
        lte(campaigns.scheduledStartAt, new Date())
      )
    );
}

/**
 * Scan for enrollments whose next step is due and enqueue a send job for each.
 * Invoked by the repeatable `campaign-tick` job every minute.
 */
export async function tickDueEnrollments(limit = 500): Promise<number> {
  await activateScheduledCampaigns();

  const due = await db
    .select({ id: campaignEnrollments.id })
    .from(campaignEnrollments)
    .innerJoin(campaigns, eq(campaignEnrollments.campaignId, campaigns.id))
    .where(
      and(
        eq(campaignEnrollments.status, "active"),
        eq(campaigns.status, "active"),
        lte(campaignEnrollments.nextRunAt, new Date())
      )
    )
    .limit(limit);

  for (const row of due) {
    await enqueueSendStep(row.id);
  }
  return due.length;
}

/** The default (no-branch) next step: no-open edge, explicit edge, or order. */
function defaultNextStep(
  current: SequenceStep | undefined,
  steps: SequenceStep[]
): SequenceStep | undefined {
  if (!current) return steps[0];
  const nextId = current.nextIfNoOpen ?? current.nextStepId;
  if (nextId) {
    const byId = steps.find((s) => s.id === nextId);
    if (byId) return byId;
  }
  return steps.find((s) => s.order === current.order + 1);
}

/** Has this lead replied to anything in this campaign? */
async function leadReplied(
  orgId: string,
  campaignId: string,
  leadId: string
): Promise<boolean> {
  const row = await db
    .select({ id: messageEvents.id })
    .from(messageEvents)
    .where(
      and(
        eq(messageEvents.orgId, orgId),
        eq(messageEvents.campaignId, campaignId),
        eq(messageEvents.leadId, leadId),
        eq(messageEvents.type, "reply")
      )
    )
    .limit(1);
  return row.length > 0;
}

/** Was this specific outbound message opened (or clicked)? */
async function messageOpened(messageId: string): Promise<boolean> {
  const row = await db
    .select({ id: messageEvents.id })
    .from(messageEvents)
    .where(
      and(
        eq(messageEvents.messageId, messageId),
        inArray(messageEvents.type, ["open", "click"])
      )
    )
    .limit(1);
  return row.length > 0;
}

/** The most recent outbound message actually sent for this enrollment. */
async function lastSentMessage(enrollmentId: string) {
  return db.query.messages.findFirst({
    where: and(
      eq(messages.enrollmentId, enrollmentId),
      eq(messages.direction, "outbound"),
      inArray(messages.status, ["sent", "delivered", "opened", "clicked", "replied"])
    ),
    orderBy: desc(messages.createdAt),
  });
}

/**
 * Evaluate the previous step's branch edges against what actually happened
 * (reply > open > no-open) and return the step the enrollment should run now.
 * Branches are evaluated HERE — when the next step comes due — rather than at
 * advance time, so opens/replies that arrived during the wait are honored.
 */
async function resolveBranchTarget(
  enrollment: { id: string; orgId: string; campaignId: string; leadId: string },
  steps: SequenceStep[]
): Promise<SequenceStep | undefined | null> {
  const prevMsg = await lastSentMessage(enrollment.id);
  if (!prevMsg?.stepId) return null; // nothing sent yet — no branch to evaluate

  const prevStep = steps.find((s) => s.id === prevMsg.stepId);
  if (!prevStep) return null;

  const hasBranches =
    prevStep.nextIfReplied ?? prevStep.nextIfOpened ?? prevStep.nextIfNoOpen;
  if (!hasBranches) return null; // purely linear step

  if (prevStep.nextIfReplied) {
    const replied = await leadReplied(
      enrollment.orgId,
      enrollment.campaignId,
      enrollment.leadId
    );
    if (replied) {
      return steps.find((s) => s.id === prevStep.nextIfReplied);
    }
  }
  if (prevStep.nextIfOpened) {
    const opened = await messageOpened(prevMsg.id);
    if (opened) {
      return steps.find((s) => s.id === prevStep.nextIfOpened);
    }
  }
  if (prevStep.nextIfNoOpen) {
    return steps.find((s) => s.id === prevStep.nextIfNoOpen);
  }
  return defaultNextStep(prevStep, steps);
}

/**
 * Process one due enrollment: re-evaluate the previous step's branches, hold
 * for the lead's local send window if configured, send the step (picking an
 * A/B variant) through a pooled mailbox, then schedule the default next step.
 */
export async function processEnrollmentStep(enrollmentId: string): Promise<void> {
  const enrollment = await db.query.campaignEnrollments.findFirst({
    where: eq(campaignEnrollments.id, enrollmentId),
  });
  if (!enrollment || enrollment.status !== "active") return;

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, enrollment.campaignId),
  });
  if (!campaign || campaign.status !== "active") return;

  // Scheduled start: hold every send until the configured start time.
  if (campaign.scheduledStartAt && campaign.scheduledStartAt > new Date()) {
    const delayMs = campaign.scheduledStartAt.getTime() - Date.now();
    await db
      .update(campaignEnrollments)
      .set({ nextRunAt: campaign.scheduledStartAt })
      .where(eq(campaignEnrollments.id, enrollmentId));
    await enqueueSendStep(enrollmentId, delayMs);
    return;
  }

  // Campaign-level daily cap: once reached, resume at the next UTC midnight.
  if (campaign.dailyCap && campaign.dailyCap > 0) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [sentToday] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.campaignId, campaign.id),
          eq(messages.direction, "outbound"),
          inArray(messages.status, [
            "sent",
            "delivered",
            "opened",
            "clicked",
            "replied",
          ]),
          gte(messages.sentAt, startOfDay)
        )
      );
    if ((sentToday?.count ?? 0) >= campaign.dailyCap) {
      const nextMidnight = new Date(startOfDay);
      nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
      // Small jitter so all capped enrollments don't fire at once.
      const resumeAt = new Date(
        nextMidnight.getTime() + Math.floor(Math.random() * 15 * 60 * 1000)
      );
      await db
        .update(campaignEnrollments)
        .set({ nextRunAt: resumeAt })
        .where(eq(campaignEnrollments.id, enrollmentId));
      await enqueueSendStep(enrollmentId, resumeAt.getTime() - Date.now());
      logger.info("daily cap reached — send deferred", {
        enrollmentId,
        campaignId: campaign.id,
        dailyCap: campaign.dailyCap,
      });
      return;
    }
  }

  const steps = await db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, campaign.id))
    .orderBy(asc(sequenceSteps.order));

  let current =
    steps.find((s) => s.id === enrollment.currentStepId) ?? steps[0];

  // Branch evaluation: what actually happened since the last send may point
  // this enrollment at a different step than the default it was queued for.
  const branchTarget = await resolveBranchTarget(enrollment, steps);
  if (branchTarget !== null) {
    if (branchTarget === undefined) {
      // A branch edge was defined but its target no longer exists → finish.
      await db
        .update(campaignEnrollments)
        .set({ status: "finished", lastStepAt: new Date() })
        .where(eq(campaignEnrollments.id, enrollmentId));
      return;
    }
    current = branchTarget;
  }

  if (!current) {
    await db
      .update(campaignEnrollments)
      .set({ status: "finished" })
      .where(eq(campaignEnrollments.id, enrollmentId));
    return;
  }

  // Wait/condition steps just advance without sending.
  if (current.type !== "email") {
    await advance(enrollment, current, steps);
    return;
  }

  // Per-timezone sending: hold until the lead's local business hours.
  if (campaign.sendPerTimezone) {
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, enrollment.leadId),
      columns: { country: true },
    });
    const tz = timezoneForLead(lead);
    if (tz && !isWithinSendWindow(tz)) {
      const resumeAt = nextSendWindow(tz);
      await db
        .update(campaignEnrollments)
        .set({ currentStepId: current.id, nextRunAt: resumeAt })
        .where(eq(campaignEnrollments.id, enrollmentId));
      await enqueueSendStep(enrollmentId, resumeAt.getTime() - Date.now());
      logger.info("send held for lead-local window", {
        enrollmentId,
        tz,
        resumeAt: resumeAt.toISOString(),
      });
      return;
    }
  }

  // Pick a mailbox from the campaign pool (rotation + rate limits).
  const poolIds = (campaign.mailboxPool ?? []) as string[];
  const picked = await pickMailbox(campaign.orgId, poolIds);
  if (!picked.mailbox) {
    // No mailbox available now — retry later.
    const retryMs = (picked.retryAfterSeconds ?? 600) * 1000;
    await db
      .update(campaignEnrollments)
      .set({ nextRunAt: new Date(Date.now() + retryMs) })
      .where(eq(campaignEnrollments.id, enrollmentId));
    await enqueueSendStep(enrollmentId, retryMs);
    return;
  }

  // A/B: rotate variants (or use the locked winner); fall back to step copy.
  const variant = await pickVariantForStep(current.id);

  const outcome = await sendSequenceStep({
    orgId: campaign.orgId,
    campaignId: campaign.id,
    stepId: current.id,
    variantId: variant?.id ?? null,
    enrollmentId: enrollment.id,
    leadId: enrollment.leadId,
    mailbox: picked.mailbox,
    subjectTemplate: variant?.subject ?? current.subject ?? "",
    bodyTemplate: variant?.body ?? current.body ?? "",
    trackOpens: campaign.trackOpens,
    trackClicks: campaign.trackClicks,
  });

  logger.info("enrollment step processed", {
    enrollmentId,
    step: current.order,
    variant: variant?.label,
    outcome: outcome.status,
  });

  if (outcome.status === "skipped" && outcome.reason === "suppressed") {
    await db
      .update(campaignEnrollments)
      .set({ status: "unsubscribed" })
      .where(eq(campaignEnrollments.id, enrollmentId));
    return;
  }

  await advance(enrollment, current, steps);
}

/**
 * Schedule the default next step (branches are re-evaluated when it comes due)
 * or finish the enrollment.
 */
async function advance(
  enrollment: {
    id: string;
    orgId: string;
    campaignId: string;
    currentStage: string;
  },
  current: SequenceStep,
  steps: SequenceStep[]
) {
  const enrollmentId = enrollment.id;
  // Any branch target could run next; schedule for the soonest of them so the
  // due-time branch evaluation happens as early as the sequence allows.
  const candidateIds = [
    current.nextIfReplied,
    current.nextIfOpened,
    current.nextIfNoOpen,
    current.nextStepId,
  ].filter((id): id is string => !!id);
  const candidates = candidateIds
    .map((id) => steps.find((s) => s.id === id))
    .filter((s): s is SequenceStep => !!s);
  const next = defaultNextStep(current, steps);

  const scheduleFor = candidates.length > 0 ? candidates : next ? [next] : [];
  if (scheduleFor.length === 0) {
    await db
      .update(campaignEnrollments)
      .set({ status: "finished", lastStepAt: new Date() })
      .where(eq(campaignEnrollments.id, enrollmentId));
    return;
  }

  const delayMsFor = (s: SequenceStep) =>
    (s.delayDays * 24 * 60 + s.delayHours * 60) * 60 * 1000;
  const soonest = scheduleFor.reduce((a, b) =>
    delayMsFor(a) <= delayMsFor(b) ? a : b
  );

  const nextStage = (next ?? soonest).stage;
  await db
    .update(campaignEnrollments)
    .set({
      currentStepId: (next ?? soonest).id,
      currentStage: nextStage,
      lastStepAt: new Date(),
      nextRunAt: new Date(Date.now() + delayMsFor(soonest)),
    })
    .where(eq(campaignEnrollments.id, enrollmentId));

  // Funnel rollup: entering a later stage converts the one being left.
  if (nextStage !== enrollment.currentStage) {
    await recordStageTransition(
      enrollment.orgId,
      enrollment.campaignId,
      enrollment.currentStage,
      nextStage
    );
  }
}

/**
 * Handle a lead replying (invoked by the reply-sync worker). Enrollments whose
 * last-sent step defines a `nextIfReplied` branch follow it; everything else
 * pauses in "replied" so a human can take over.
 */
export async function pauseOnReply(orgId: string, leadId: string) {
  const active = await db
    .select()
    .from(campaignEnrollments)
    .where(
      and(
        eq(campaignEnrollments.orgId, orgId),
        eq(campaignEnrollments.leadId, leadId),
        eq(campaignEnrollments.status, "active")
      )
    );

  for (const enrollment of active) {
    const prevMsg = await lastSentMessage(enrollment.id);
    const prevStep = prevMsg?.stepId
      ? await db.query.sequenceSteps.findFirst({
          where: eq(sequenceSteps.id, prevMsg.stepId),
        })
      : null;

    if (prevStep?.nextIfReplied) {
      const target = await db.query.sequenceSteps.findFirst({
        where: and(
          eq(sequenceSteps.id, prevStep.nextIfReplied),
          eq(sequenceSteps.campaignId, enrollment.campaignId)
        ),
      });
      if (target) {
        const delayMs =
          (target.delayDays * 24 * 60 + target.delayHours * 60) * 60 * 1000;
        await db
          .update(campaignEnrollments)
          .set({
            currentStepId: target.id,
            currentStage: target.stage,
            nextRunAt: new Date(Date.now() + delayMs),
          })
          .where(eq(campaignEnrollments.id, enrollment.id));
        if (target.stage !== enrollment.currentStage) {
          await recordStageTransition(
            enrollment.orgId,
            enrollment.campaignId,
            enrollment.currentStage,
            target.stage
          );
        }
        continue;
      }
    }

    await db
      .update(campaignEnrollments)
      .set({ status: "replied" })
      .where(eq(campaignEnrollments.id, enrollment.id));
    // A reply is the conversion event for whatever stage the lead was in.
    await recordStageReplyConversion(
      enrollment.orgId,
      enrollment.campaignId,
      enrollment.currentStage
    );
  }
}
