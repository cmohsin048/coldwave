"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mailboxes, sendingDomains, warmupConfigs } from "@/db/schema";
import { action } from "@/lib/action";
import { sealSecrets } from "@/modules/mailboxes/credentials";
import { verifyMailboxConnection, invalidateTransport } from "@/modules/sending/transport";
import { emailDomain } from "@/lib/utils";

const connectSchema = z.object({
  email: z.string().email(),
  fromName: z.string().optional(),
  provider: z
    .enum(["gmail", "google_workspace", "outlook", "office365", "smtp"])
    .default("smtp"),
  smtpHost: z.string().min(1),
  smtpPort: z.coerce.number().default(587),
  smtpSecure: z.boolean().default(false),
  smtpPass: z.string().min(1),
  imapHost: z.string().optional(),
  imapPort: z.coerce.number().optional(),
  imapPass: z.string().optional(),
  dailySendLimit: z.coerce.number().min(1).max(500).default(40),
  hourlySendLimit: z.coerce.number().min(1).max(200).default(10),
});

/**
 * Connect a mailbox: encrypt credentials (AES-256-GCM), verify the SMTP
 * connection, upsert the sending domain, and create a disabled warmup config.
 */
export const connectMailbox = action(
  connectSchema,
  async (input, ctx) => {
    const domain = emailDomain(input.email);

    // Upsert sending domain for this org.
    let domainRow = await db.query.sendingDomains.findFirst({
      where: and(
        eq(sendingDomains.orgId, ctx.orgId),
        eq(sendingDomains.domain, domain)
      ),
    });
    if (!domainRow) {
      [domainRow] = await db
        .insert(sendingDomains)
        .values({ orgId: ctx.orgId, domain })
        .returning();
    }

    const encryptedCredentials = sealSecrets({
      smtpPass: input.smtpPass,
      imapPass: input.imapPass,
    });

    const [mailbox] = await db
      .insert(mailboxes)
      .values({
        orgId: ctx.orgId,
        domainId: domainRow!.id,
        provider: input.provider,
        status: "connecting",
        email: input.email,
        fromName: input.fromName,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpSecure: input.smtpSecure,
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        encryptedCredentials,
        dailySendLimit: input.dailySendLimit,
        hourlySendLimit: input.hourlySendLimit,
      })
      .returning();

    // Verify the SMTP connection; mark status accordingly.
    const check = await verifyMailboxConnection(mailbox!);
    await db
      .update(mailboxes)
      .set({
        status: check.ok ? "active" : "error",
        lastError: check.ok ? null : check.error,
      })
      .where(eq(mailboxes.id, mailbox!.id));

    // Create a default (disabled) warmup config.
    await db.insert(warmupConfigs).values({
      orgId: ctx.orgId,
      mailboxId: mailbox!.id,
      status: "disabled",
    });

    revalidatePath("/mailboxes");
    return { mailboxId: mailbox!.id, verified: check.ok, error: check.error };
  },
  { role: "admin" }
);

/** Re-run the SMTP connection check for a mailbox and update its status. */
export const reverifyMailbox = action(
  z.object({ mailboxId: z.string() }),
  async (input, ctx) => {
    const mailbox = await db.query.mailboxes.findFirst({
      where: and(
        eq(mailboxes.id, input.mailboxId),
        eq(mailboxes.orgId, ctx.orgId)
      ),
    });
    if (!mailbox) throw new Error("Mailbox not found");

    // Drop the cached transport so the check uses fresh connections/creds.
    invalidateTransport(mailbox.id);
    const check = await verifyMailboxConnection(mailbox);

    await db
      .update(mailboxes)
      .set({
        // Don't clobber a warming state on success — only recover from error.
        status: check.ok
          ? mailbox.status === "error" || mailbox.status === "connecting"
            ? "active"
            : mailbox.status
          : "error",
        lastError: check.ok ? null : check.error,
      })
      .where(eq(mailboxes.id, mailbox.id));

    revalidatePath("/mailboxes");
    return { verified: check.ok, error: check.error };
  },
  { role: "admin" }
);

export const deleteMailbox = action(
  z.object({ mailboxId: z.string() }),
  async (input, ctx) => {
    await db
      .delete(mailboxes)
      .where(
        and(eq(mailboxes.id, input.mailboxId), eq(mailboxes.orgId, ctx.orgId))
      );
    invalidateTransport(input.mailboxId);
    revalidatePath("/mailboxes");
    return { deleted: true };
  },
  { role: "admin" }
);
