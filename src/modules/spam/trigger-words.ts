/**
 * Weighted spam trigger words/phrases. Higher weight = stronger spam signal.
 * This is a curated starter set spanning the classic filter categories; extend
 * from your own bounce/complaint data over time.
 */
export const TRIGGER_WORDS: Array<{ term: string; weight: number }> = [
  // Money / urgency
  { term: "free", weight: 0.4 },
  { term: "100% free", weight: 1.2 },
  { term: "risk free", weight: 1.0 },
  { term: "guarantee", weight: 0.8 },
  { term: "guaranteed", weight: 0.8 },
  { term: "no cost", weight: 0.9 },
  { term: "cash", weight: 0.7 },
  { term: "cheap", weight: 0.6 },
  { term: "discount", weight: 0.5 },
  { term: "save big money", weight: 1.2 },
  { term: "earn extra cash", weight: 1.3 },
  { term: "make money", weight: 1.1 },
  { term: "double your income", weight: 1.4 },
  { term: "million dollars", weight: 1.3 },
  { term: "$$$", weight: 1.5 },
  // Pressure
  { term: "act now", weight: 1.1 },
  { term: "urgent", weight: 0.9 },
  { term: "limited time", weight: 0.9 },
  { term: "expires", weight: 0.6 },
  { term: "apply now", weight: 0.7 },
  { term: "buy now", weight: 0.9 },
  { term: "order now", weight: 0.9 },
  { term: "click here", weight: 1.0 },
  { term: "click below", weight: 0.8 },
  { term: "don't delete", weight: 1.2 },
  { term: "this isn't spam", weight: 1.6 },
  { term: "not spam", weight: 1.4 },
  // Sales-y
  { term: "amazing", weight: 0.5 },
  { term: "incredible deal", weight: 1.0 },
  { term: "best price", weight: 0.7 },
  { term: "lowest price", weight: 0.8 },
  { term: "winner", weight: 0.9 },
  { term: "congratulations", weight: 0.8 },
  { term: "you've been selected", weight: 1.3 },
  { term: "exclusive deal", weight: 0.8 },
  { term: "no obligation", weight: 0.8 },
  { term: "no strings attached", weight: 0.9 },
  { term: "increase sales", weight: 0.6 },
  { term: "increase traffic", weight: 0.7 },
  // Finance / pharma classics
  { term: "viagra", weight: 2.0 },
  { term: "pharmacy", weight: 1.2 },
  { term: "weight loss", weight: 1.1 },
  { term: "credit card", weight: 0.6 },
  { term: "refinance", weight: 0.9 },
  { term: "pre-approved", weight: 1.0 },
  { term: "investment", weight: 0.4 },
  { term: "crypto", weight: 0.5 },
  { term: "bitcoin", weight: 0.5 },
];

export interface TriggerHit {
  term: string;
  weight: number;
  count: number;
}

/** Scan text for trigger words. Returns hits and their summed weighted score. */
export function scanTriggerWords(text: string): {
  hits: TriggerHit[];
  score: number;
} {
  const lower = ` ${text.toLowerCase()} `;
  const hits: TriggerHit[] = [];
  let score = 0;
  for (const { term, weight } of TRIGGER_WORDS) {
    // Count non-overlapping occurrences.
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "g");
    const count = (lower.match(re) ?? []).length;
    if (count > 0) {
      hits.push({ term, weight, count });
      score += weight * count;
    }
  }
  return { hits, score };
}
