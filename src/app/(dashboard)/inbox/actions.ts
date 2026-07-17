"use server";

import { revalidatePath } from "next/cache";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { messages, mailboxes } from "@/db/schema";
import { action } from "@/lib/action";
import { suggestReply } from "@/modules/ai/openai";
import { sendViaMailbox } from "@/modules/sending/transport";

/** Generate an AI-suggested reply for an inbound message thread. */
export const suggestReplyAction = action(
  z.object({ messageId: z.string(), goal: z.string().default("book a meeting"), tone: z.string().default("friendly, concise") }),
  async (input, ctx) => {
    const inbound = await db.query.messages.findFirst({
      where: and(eq(messages.id, input.messageId), eq(messages.orgId, ctx.orgId)),
    });
    if (!inbound) throw new Error("Message not found");

    // Best-effort thread context: the inbound subject + any prior outbound body.
    const outbound = inbound.leadId
      ? await db.query.messages.findFirst({
          where: and(
            eq(messages.orgId, ctx.orgId),
            eq(messages.leadId, inbound.leadId),
            eq(messages.direction, "outbound")
          ),
        })
      : null;

    const threadContext = [
      outbound?.body ? `We wrote:\n${outbound.body}` : "",
      `They replied (subject: ${inbound.subject ?? "(none)"}).`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const draft = await suggestReply({
      threadContext,
      goal: input.goal,
      tone: input.tone,
    });
    return { draft };
  }
);

/**
 * Send a reply to an inbound message through the mailbox that received it,
 * threading it properly (In-Reply-To / References + "Re:" subject).
 */
export const sendReplyAction = action(
  z.object({ messageId: z.string(), body: z.string().min(1).max(10_000) }),
  async (input, ctx) => {
    const inbound = await db.query.messages.findFirst({
      where: and(
        eq(messages.id, input.messageId),
        eq(messages.orgId, ctx.orgId),
        eq(messages.direction, "inbound")
      ),
    });
    if (!inbound) throw new Error("Message not found");
    if (!inbound.fromEmail) throw new Error("Message has no sender address");

    // Reply from the mailbox that received it; fall back to any active one.
    const mailbox =
      (inbound.mailboxId
        ? await db.query.mailboxes.findFirst({
            where: and(
              eq(mailboxes.id, inbound.mailboxId),
              eq(mailboxes.orgId, ctx.orgId)
            ),
          })
        : null) ??
      (await db.query.mailboxes.findFirst({
        where: and(
          eq(mailboxes.orgId, ctx.orgId),
          eq(mailboxes.status, "active")
        ),
      }));
    if (!mailbox) throw new Error("No connected mailbox available to reply from");

    const subject = inbound.subject?.replace(/^(re:\s*)+/i, "") ?? "";
    const replySubject = `Re: ${subject}`.trim();

    // Thread onto the prior conversation.
    const priorOutbound = inbound.leadId
      ? await db.query.messages.findFirst({
          where: and(
            eq(messages.orgId, ctx.orgId),
            eq(messages.leadId, inbound.leadId),
            eq(messages.direction, "outbound")
          ),
          orderBy: desc(messages.createdAt),
        })
      : null;
    const references = [
      priorOutbound?.messageIdHeader,
      inbound.messageIdHeader,
    ]
      .filter(Boolean)
      .join(" ");

    const result = await sendViaMailbox(mailbox, {
      from: mailbox.email,
      to: inbound.fromEmail,
      subject: replySubject,
      text: input.body,
      inReplyTo: inbound.messageIdHeader ?? undefined,
      references: references || undefined,
    });

    await db.insert(messages).values({
      orgId: ctx.orgId,
      direction: "outbound",
      status: "sent",
      campaignId: inbound.campaignId,
      leadId: inbound.leadId,
      mailboxId: mailbox.id,
      fromEmail: mailbox.email,
      toEmail: inbound.fromEmail,
      subject: replySubject,
      body: input.body,
      messageIdHeader: result.messageId,
      inReplyTo: inbound.messageIdHeader,
      references: references || null,
      sentAt: new Date(),
    });

    revalidatePath("/inbox");
    return { sent: true };
  }
);
