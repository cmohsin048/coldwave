import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, type Lead } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import { getOpenAI } from "./openai";

/**
 * Per-lead personalized opening line for the {{icebreaker}} merge field.
 *
 * Templates get one AI-written first line grounded in the lead's enrichment
 * data (title, company, industry, size, tech stack) instead of the same copy
 * with names swapped in — the single biggest reply-rate lever in cold email.
 *
 * Generated lazily at first send and cached in `lead.customFields.icebreaker`
 * so each lead costs exactly one short completion across the whole sequence.
 * Best-effort: on any failure the field renders as empty and the email still
 * goes out.
 */

export async function generateIcebreaker(lead: Lead): Promise<string> {
  const openai = getOpenAI();
  const model = getEnv().OPENAI_MODEL;

  const facts = {
    firstName: lead.firstName,
    title: lead.title,
    seniority: lead.seniority,
    companyName: lead.companyName,
    industry: lead.industry,
    headcount: lead.headcount,
    location: lead.location,
    techStack: lead.techStack?.slice(0, 8),
  };

  const raw = await withRetry(
    async () => {
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You write the opening line of a cold email. One sentence, under 25 words, plain text. Reference something specific about the recipient's role, company, or industry from the facts given. Sound like a busy human peer: no flattery clichés ('impressed by', 'love what you're doing'), no exclamation marks, no emojis, no greeting (the template handles 'Hi X'), no quotes around the output. Never invent facts that are not provided.",
          },
          {
            role: "user",
            content: JSON.stringify(facts),
          },
        ],
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) throw new Error("OpenAI returned empty content");
      return content;
    },
    { label: "openai-icebreaker", retries: 2, baseDelayMs: 1000 }
  );

  // Strip wrapping quotes the model sometimes adds despite instructions.
  return raw.replace(/^["'“”]+|["'“”]+$/g, "").trim();
}

/**
 * Return the lead's cached icebreaker, generating and persisting it on first
 * use. Returns "" when generation isn't possible (no key, API error) — the
 * merge field then renders empty and the send proceeds.
 */
export async function ensureLeadIcebreaker(lead: Lead): Promise<string> {
  const cached = lead.customFields?.icebreaker;
  if (cached) return cached;

  try {
    const line = await generateIcebreaker(lead);
    if (!line) return "";
    await db
      .update(leads)
      .set({ customFields: { ...(lead.customFields ?? {}), icebreaker: line } })
      .where(eq(leads.id, lead.id));
    return line;
  } catch (err) {
    logger.warn("icebreaker generation failed", {
      leadId: lead.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}
