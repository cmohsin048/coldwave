import OpenAI from "openai";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { withRetry } from "@/lib/retry";

let client: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (client) return client;
  const key = getEnv().OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");
  client = new OpenAI({ apiKey: key });
  return client;
}

/** Zod schema mirroring the JSON schema we ask the model to fill. */
export const sequenceSchema = z.object({
  strategy: z.string(),
  steps: z
    .array(
      z.object({
        order: z.number().int(),
        stage: z.enum(["awareness", "interest", "demo", "close"]),
        delayDays: z.number().int().min(0),
        subject: z.string(),
        // Body includes spintax {a|b} and merge fields {{firstName}}.
        body: z.string(),
        variants: z
          .array(z.object({ subject: z.string(), body: z.string() }))
          .default([]),
        branch: z
          .object({
            ifReplied: z.string().nullable().default(null),
            ifOpened: z.string().nullable().default(null),
            ifNoOpen: z.string().nullable().default(null),
          })
          .default({ ifReplied: null, ifOpened: null, ifNoOpen: null }),
      })
    )
    .min(1),
});
export type GeneratedSequence = z.infer<typeof sequenceSchema>;

/** JSON Schema handed to OpenAI structured outputs (strict mode). */
const jsonSchema = {
  name: "cold_email_sequence",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["strategy", "steps"],
    properties: {
      strategy: { type: "string", description: "One-paragraph rationale." },
      steps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "order",
            "stage",
            "delayDays",
            "subject",
            "body",
            "variants",
            "branch",
          ],
          properties: {
            order: { type: "integer" },
            stage: {
              type: "string",
              enum: ["awareness", "interest", "demo", "close"],
            },
            delayDays: { type: "integer" },
            subject: { type: "string" },
            body: {
              type: "string",
              description:
                "Use spintax {a|b} for variation and merge fields like {{firstName}}, {{companyName}}. Must include an unsubscribe-friendly close.",
            },
            variants: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["subject", "body"],
                properties: {
                  subject: { type: "string" },
                  body: { type: "string" },
                },
              },
            },
            branch: {
              type: "object",
              additionalProperties: false,
              required: ["ifReplied", "ifOpened", "ifNoOpen"],
              properties: {
                ifReplied: { type: ["string", "null"] },
                ifOpened: { type: ["string", "null"] },
                ifNoOpen: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
} as const;

export interface CampaignBrief {
  icp: string;
  product: string;
  tone: string;
  offer: string;
  goal: string;
  numSteps?: number;
}

/**
 * Generate a multi-step cold-email sequence with subject lines, spintax body
 * variants, delay days, and branch conditions — via OpenAI structured outputs.
 */
export async function generateSequence(
  brief: CampaignBrief
): Promise<GeneratedSequence> {
  const openai = getOpenAI();
  const model = getEnv().OPENAI_MODEL;

  const raw = await withRetry(
    async () => {
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.8,
        response_format: { type: "json_schema", json_schema: jsonSchema },
        messages: [
          {
            role: "system",
            content:
              "You are an expert cold-email strategist. Produce concise, human, high-deliverability sequences. Avoid spam-trigger words, ALL CAPS, and excessive punctuation. Personalize with merge fields and add spintax {a|b|c} to vary phrasing across recipients. Each step must feel like a natural follow-up. Keep emails short (60-120 words).",
          },
          {
            role: "user",
            content: JSON.stringify({
              icp: brief.icp,
              product: brief.product,
              tone: brief.tone,
              offer: brief.offer,
              goal: brief.goal,
              requestedSteps: brief.numSteps ?? 4,
              stages: ["awareness", "interest", "demo", "close"],
              instructions:
                "Map steps across the funnel stages. Add A/B variants (1-2) per email step. Set delayDays between steps (0 for first). Use branch.ifReplied/ifOpened/ifNoOpen to name the next logical step intent or null.",
            }),
          },
        ],
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned empty content");
      return content;
    },
    { label: "openai", retries: 4, baseDelayMs: 1500 }
  );

  const parsed = sequenceSchema.parse(JSON.parse(raw));
  return parsed;
}

/** Suggest a reply to an inbound message (unified inbox assist). */
export async function suggestReply(params: {
  threadContext: string;
  goal: string;
  tone: string;
}): Promise<string> {
  const openai = getOpenAI();
  const model = getEnv().OPENAI_MODEL;

  return withRetry(
    async () => {
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You draft concise, friendly, non-pushy replies to cold-email responses. Keep it under 90 words and move the conversation toward the goal.",
          },
          {
            role: "user",
            content: `Goal: ${params.goal}\nTone: ${params.tone}\n\nThread:\n${params.threadContext}\n\nDraft the best reply:`,
          },
        ],
      });
      return completion.choices[0]?.message?.content ?? "";
    },
    { label: "openai-reply", retries: 3 }
  );
}
