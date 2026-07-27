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
                "Use spintax {a|b} for variation and merge fields like {{firstName}}, {{companyName}}. {{icebreaker}} renders as a one-line opener personalized per lead from enrichment data — start the FIRST email's body with it (after the greeting). Must include an unsubscribe-friendly close.",
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

/** AI classification of an inbound reply's sentiment. */
export interface ReplyClassification {
  sentiment: "positive" | "neutral" | "negative";
  /** One-line gist of what the lead said (max ~120 chars). */
  summary: string;
}

const sentimentJsonSchema = {
  name: "reply_sentiment",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["sentiment", "summary"],
    properties: {
      sentiment: {
        type: "string",
        enum: ["positive", "neutral", "negative"],
        description:
          "positive = interested / wants to talk / asks for more info; negative = not interested / stop contacting / hostile; neutral = out-of-office, auto-reply, ambiguous, or unclear.",
      },
      summary: {
        type: "string",
        description: "One short sentence summarizing the reply.",
      },
    },
  },
} as const;

/**
 * Classify an inbound campaign reply as positive / neutral / negative with a
 * one-line summary. Used by the reply-sync worker; callers should treat
 * failures as non-fatal (leave the message unclassified).
 */
export async function classifyReplySentiment(params: {
  subject: string;
  body: string;
}): Promise<ReplyClassification> {
  const openai = getOpenAI();
  const model = getEnv().OPENAI_MODEL;

  const raw = await withRetry(
    async () => {
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: sentimentJsonSchema,
        },
        messages: [
          {
            role: "system",
            content:
              "You classify replies to cold sales emails. Judge the LEAD's attitude toward continuing the conversation. Out-of-office and automatic replies are neutral. Unsubscribe requests and 'not interested' are negative, even when phrased politely.",
          },
          {
            role: "user",
            content: `Subject: ${params.subject}\n\nReply:\n${params.body.slice(0, 4000)}`,
          },
        ],
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned empty content");
      return content;
    },
    { label: "openai-sentiment", retries: 3, baseDelayMs: 1000 }
  );

  const parsed = JSON.parse(raw) as ReplyClassification;
  if (!["positive", "neutral", "negative"].includes(parsed.sentiment)) {
    throw new Error(`Unexpected sentiment: ${parsed.sentiment}`);
  }
  return parsed;
}

/** AI-planned Apollo people-search filters from a plain-English prompt. */
export interface LeadSearchPlan {
  listName: string;
  personTitles: string[];
  seniorities: string[];
  industries: string[];
  locations: string[];
  employeeRanges: string[];
  technologies: string[];
  keywords: string;
}

const SENIORITY_VALUES = [
  "owner", "founder", "c_suite", "partner", "vp", "head",
  "director", "manager", "senior", "entry", "intern",
];
const EMPLOYEE_RANGE_VALUES = [
  "1,10", "11,20", "21,50", "51,100", "101,200", "201,500",
  "501,1000", "1001,2000", "2001,5000", "5001,10000", "10001,1000000",
];

const leadSearchJsonSchema = {
  name: "lead_search_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "listName",
      "personTitles",
      "seniorities",
      "industries",
      "locations",
      "employeeRanges",
      "technologies",
      "keywords",
    ],
    properties: {
      listName: {
        type: "string",
        description:
          "Short descriptive list name, e.g. 'Trucking company owners — Texas'.",
      },
      personTitles: {
        type: "array",
        items: { type: "string" },
        description:
          "Job titles the person holds (usually the strongest filter).",
      },
      seniorities: {
        type: "array",
        items: { type: "string", enum: SENIORITY_VALUES },
      },
      industries: {
        type: "array",
        items: { type: "string" },
        description:
          "Broad industry names (e.g. 'logistics & supply chain'). Niche terms that aren't a recognized industry belong in keywords.",
      },
      locations: {
        type: "array",
        items: { type: "string" },
        description: "Countries, states/regions, or cities.",
      },
      employeeRanges: {
        type: "array",
        items: { type: "string", enum: EMPLOYEE_RANGE_VALUES },
        description: "Company headcount ranges as 'min,max' strings.",
      },
      technologies: {
        type: "array",
        items: { type: "string" },
        description: "Tools/tech the company must use, only if stated.",
      },
      keywords: {
        type: "string",
        description:
          "Free-text terms for niches that aren't a title or industry. Empty string if none.",
      },
    },
  },
} as const;

/**
 * Translate a plain-English description of a target audience into Apollo
 * people-search filters. Only filters clearly implied by the prompt are set —
 * empty beats guessed.
 */
export async function planLeadSearch(prompt: string): Promise<LeadSearchPlan> {
  const openai = getOpenAI();
  const model = getEnv().OPENAI_MODEL;

  const raw = await withRetry(
    async () => {
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: leadSearchJsonSchema,
        },
        messages: [
          {
            role: "system",
            content:
              "You translate a plain-English description of a cold-outreach target audience into people-search filters. Fill only what the description clearly implies — an empty array is better than a guess. Job titles are the strongest filter: include common synonyms (e.g. 'owner' also 'president', 'proprietor'). Use broad, recognizable industry names; niche phrasing goes in keywords. If company size is implied ('small businesses' → 1,10 and 11,20), map it to the allowed ranges.",
          },
          { role: "user", content: prompt },
        ],
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned empty content");
      return content;
    },
    { label: "openai-lead-search", retries: 3, baseDelayMs: 1000 }
  );

  return JSON.parse(raw) as LeadSearchPlan;
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
