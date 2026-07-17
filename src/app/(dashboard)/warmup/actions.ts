"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { warmupConfigs, mailboxes } from "@/db/schema";
import { action } from "@/lib/action";
import { startWarmup } from "@/modules/warmup/engine";

export const toggleWarmup = action(
  z.object({ mailboxId: z.string(), enable: z.boolean() }),
  async (input, ctx) => {
    if (input.enable) {
      await startWarmup(ctx.orgId, input.mailboxId);
    } else {
      await db
        .update(warmupConfigs)
        .set({ status: "paused" })
        .where(
          and(
            eq(warmupConfigs.orgId, ctx.orgId),
            eq(warmupConfigs.mailboxId, input.mailboxId)
          )
        );
      await db
        .update(mailboxes)
        .set({ status: "active" })
        .where(
          and(eq(mailboxes.id, input.mailboxId), eq(mailboxes.orgId, ctx.orgId))
        );
    }
    revalidatePath("/warmup");
    return { enabled: input.enable };
  }
);

/** Edit a mailbox's warmup ramp curve + behavior settings. */
export const updateWarmupConfig = action(
  z.object({
    mailboxId: z.string(),
    startVolume: z.coerce.number().int().min(1).max(50),
    dailyIncrement: z.coerce.number().int().min(1).max(20),
    maxVolume: z.coerce.number().int().min(5).max(200),
    replyRate: z.coerce.number().int().min(0).max(100),
    businessHoursOnly: z.boolean(),
    weekendReduction: z.boolean(),
    timezone: z.string().min(1),
  }),
  async (input, ctx) => {
    if (input.maxVolume < input.startVolume) {
      throw new Error("Max volume must be at least the start volume");
    }
    // Validate the IANA timezone before persisting it.
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
    } catch {
      throw new Error(`Unknown timezone: ${input.timezone}`);
    }

    const updated = await db
      .update(warmupConfigs)
      .set({
        startVolume: input.startVolume,
        dailyIncrement: input.dailyIncrement,
        maxVolume: input.maxVolume,
        replyRate: input.replyRate,
        businessHoursOnly: input.businessHoursOnly,
        weekendReduction: input.weekendReduction,
        timezone: input.timezone,
      })
      .where(
        and(
          eq(warmupConfigs.orgId, ctx.orgId),
          eq(warmupConfigs.mailboxId, input.mailboxId)
        )
      )
      .returning({ id: warmupConfigs.id });
    if (updated.length === 0) throw new Error("Warmup config not found");

    revalidatePath("/warmup");
    return { updated: true };
  }
);
