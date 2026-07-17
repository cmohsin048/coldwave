import { scanTriggerWords } from "./trigger-words";
import { analyzeContent } from "./content-checks";
import {
  checkDnsAuth,
  checkBlacklists,
  type DnsAuthResult,
} from "./dns-auth";
import { checkWithSpamAssassin } from "./spamassassin";

/**
 * The pre-send spam engine. Produces a normalized 0-10 score (10 = worst) by
 * combining:
 *   - SpamAssassin score (if the daemon is reachable),
 *   - weighted trigger-word hits,
 *   - content heuristics (link/image ratios, caps, punctuation, subject),
 *   - DNS auth posture (SPF/DKIM/DMARC/rDNS),
 *   - DNSBL blacklist listings.
 *
 * Returns a red/amber/green band plus concrete fix suggestions and the raw
 * breakdown for auditing/persistence.
 */

export interface SpamCheckInput {
  subject: string;
  body: string;
  fromEmail?: string;
  toEmail?: string;
  /** Sending domain for DNS auth checks. */
  domain?: string;
  /** Sending IP for rDNS + blacklist checks. */
  sendingIp?: string;
  /** Skip network checks (DNS/DNSBL/SpamAssassin) for a fast content-only pass. */
  contentOnly?: boolean;
}

export type SpamBand = "green" | "amber" | "red";

export interface SpamCheckResult {
  score: number; // 0-10
  band: SpamBand;
  passed: boolean; // score < block threshold
  suggestions: string[];
  breakdown: {
    spamassassin: { score: number; threshold: number; isSpam: boolean } | null;
    triggerWords: { term: string; weight: number; count: number }[];
    content: {
      metrics: ReturnType<typeof analyzeContent>["metrics"];
      signals: { key: string; penalty: number; detail: string }[];
    };
    dns: DnsAuthResult | null;
    blacklists: string[];
  };
}

function band(score: number): SpamBand {
  if (score < 3) return "green";
  if (score < 5) return "amber";
  return "red";
}

export async function runSpamCheck(
  input: SpamCheckInput,
  blockThreshold = 5
): Promise<SpamCheckResult> {
  const suggestions: string[] = [];

  // --- Content signals (always run) ---
  const triggers = scanTriggerWords(`${input.subject} ${input.body}`);
  const content = analyzeContent(input.subject, input.body);
  for (const s of content.signals) suggestions.push(s.detail);
  if (triggers.hits.length > 0) {
    const top = triggers.hits
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map((h) => `"${h.term}"`)
      .join(", ");
    suggestions.push(`Remove or soften spam trigger words: ${top}.`);
  }

  // --- Network checks (optional) ---
  let sa: Awaited<ReturnType<typeof checkWithSpamAssassin>> = null;
  let dns: DnsAuthResult | null = null;
  let blacklists: string[] = [];

  if (!input.contentOnly) {
    [sa, dns, blacklists] = await Promise.all([
      checkWithSpamAssassin({
        subject: input.subject,
        body: input.body,
        from: input.fromEmail,
        to: input.toEmail,
      }),
      input.domain
        ? checkDnsAuth(input.domain, input.sendingIp)
        : Promise.resolve(null),
      input.sendingIp ? checkBlacklists(input.sendingIp) : Promise.resolve([]),
    ]);
  }

  // --- Score assembly ---
  // Content + trigger heuristics. Capped at 9 so egregious content can exceed
  // the block threshold on its own (content-only mode has no SpamAssassin/DNS
  // signal to add on top).
  const heuristicRaw = triggers.score + content.score;
  const heuristicScore = Math.min(9, heuristicRaw);

  // SpamAssassin contributes up to 6 (its own ~5 threshold mapped in).
  const saScore = sa ? Math.min(6, Math.max(0, sa.score)) : 0;

  // DNS auth penalties (missing auth is a big deliverability hit).
  let dnsPenalty = 0;
  if (dns) {
    if (!dns.spf.present) {
      dnsPenalty += 1.2;
      suggestions.push("Add an SPF record for your sending domain.");
    }
    if (!dns.dkim.present) {
      dnsPenalty += 1.2;
      suggestions.push("Configure DKIM signing for your sending domain.");
    }
    if (!dns.dmarc.present) {
      dnsPenalty += 1.0;
      suggestions.push("Publish a DMARC policy (start with p=none).");
    } else if (dns.dmarc.policy === "none") {
      suggestions.push("Strengthen DMARC from p=none to quarantine/reject.");
    }
    if (input.sendingIp && !dns.rdns.valid) {
      dnsPenalty += 0.8;
      suggestions.push("Set up valid reverse DNS (PTR) for your sending IP.");
    }
  }

  // Blacklist listings are severe.
  const blacklistPenalty = blacklists.length * 2;
  if (blacklists.length > 0) {
    suggestions.push(
      `Your sending IP is listed on: ${blacklists.join(", ")}. Request delisting before sending.`
    );
  }

  // Weighted blend, then clamp to 0-10. When SpamAssassin is available we blend
  // it 50/50 with heuristics; without it, heuristics carry full weight so a
  // content-only check can still reach (and exceed) the block threshold.
  const combined =
    (sa ? saScore * 0.5 + heuristicScore * 0.5 : heuristicScore) +
    dnsPenalty +
    blacklistPenalty;

  const score = Math.max(0, Math.min(10, Number(combined.toFixed(1))));

  if (suggestions.length === 0) {
    suggestions.push("Looks clean. Good subject length and content balance.");
  }

  return {
    score,
    band: band(score),
    passed: score < blockThreshold,
    suggestions: [...new Set(suggestions)],
    breakdown: {
      spamassassin: sa,
      triggerWords: triggers.hits,
      content: { metrics: content.metrics, signals: content.signals },
      dns,
      blacklists,
    },
  };
}
