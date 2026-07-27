/**
 * Keyword fallback for reply sentiment, used only when the AI classifier is
 * unavailable (no OpenAI key, or the API call failed). Deliberately
 * conservative: it only fires on unambiguous phrases and returns null for
 * everything else, leaving the message unclassified so the reclassification
 * sweep can retry with the real classifier later.
 *
 * Keyword verdicts are never stored on the message row — they exist so a hot
 * lead's reply still triggers a "needs review" alert instead of silence.
 */

export interface KeywordClassification {
  sentiment: "positive" | "neutral" | "negative";
  summary: string;
}

const AUTO_REPLY_RE =
  /out of (the )?office|auto[- ]?repl|automatic repl|on (annual|parental|maternity|paternity|sick) leave|currently on leave|no longer (with|at|works)/i;

// Checked before positive: "not interested" must not match "interested".
const NEGATIVE_RE =
  /unsubscribe|not interested|no longer interested|remove me|take me off|stop (emailing|contacting|sending)|do not (contact|email)|don'?t (contact|email)|no thank/i;

const POSITIVE_RE =
  /interested|let'?s (talk|chat|connect)|sounds (good|great|interesting)|(book|schedule|set up) a (call|meeting|demo|time)|send (me )?(more info|pricing|details|the deck)|tell me more|happy to (chat|talk|connect)|give me a call|call me|what('?s| is) the (price|cost|pricing)|how much (does|is|would)/i;

export function keywordClassifyReply(params: {
  subject: string;
  body: string;
}): KeywordClassification | null {
  const text = `${params.subject}\n${params.body}`;
  if (!text.trim()) return null;

  if (AUTO_REPLY_RE.test(text)) {
    return {
      sentiment: "neutral",
      summary: "Looks like an automatic reply (keyword match).",
    };
  }
  if (NEGATIVE_RE.test(text)) {
    return {
      sentiment: "negative",
      summary: "Opt-out or rejection language detected (keyword match).",
    };
  }
  if (POSITIVE_RE.test(text)) {
    return {
      sentiment: "positive",
      summary: "Buying-signal language detected (keyword match).",
    };
  }
  return null;
}
