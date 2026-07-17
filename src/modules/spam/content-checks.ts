/**
 * Heuristic content checks that mirror common spam-filter signals. Each returns
 * a partial penalty (0+) plus a human-readable note used for fix suggestions.
 */

export interface ContentSignal {
  key: string;
  penalty: number;
  detail: string;
}

const SHORTENER_HOSTS = [
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "t.co",
  "ow.ly",
  "buff.ly",
  "is.gd",
  "rebrand.ly",
  "cutt.ly",
];

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

function extractLinks(text: string): string[] {
  const urls =
    text.match(/https?:\/\/[^\s"'<>)]+/gi) ?? [];
  const hrefs =
    [...text.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]!) ?? [];
  return [...urls, ...hrefs];
}

export function analyzeContent(subject: string, body: string): {
  signals: ContentSignal[];
  score: number;
  metrics: Record<string, number>;
} {
  const signals: ContentSignal[] = [];
  const plain = stripHtml(body);
  const words = plain.split(/\s+/).filter(Boolean);
  const links = extractLinks(body);

  // Link-to-text ratio.
  const linkTextRatio = words.length > 0 ? links.length / words.length : 0;
  if (linkTextRatio > 0.05 && links.length >= 2) {
    signals.push({
      key: "link_ratio",
      penalty: Math.min(2, linkTextRatio * 20),
      detail: `High link-to-text ratio (${links.length} links / ${words.length} words). Reduce links.`,
    });
  }

  // Image-to-text ratio.
  const imgCount = (body.match(/<img\b/gi) ?? []).length;
  const imageTextRatio = words.length > 0 ? imgCount / words.length : imgCount;
  if (imgCount > 0 && (words.length < 20 || imageTextRatio > 0.1)) {
    signals.push({
      key: "image_ratio",
      penalty: Math.min(1.5, imgCount * 0.5),
      detail: `Image-heavy with little text (${imgCount} images, ${words.length} words). Add more text.`,
    });
  }

  // Shortened URLs.
  const shorteners = links.filter((l) =>
    SHORTENER_HOSTS.some((h) => l.toLowerCase().includes(h))
  );
  if (shorteners.length > 0) {
    signals.push({
      key: "shortener",
      penalty: shorteners.length * 1.0,
      detail: `Shortened URLs detected (${shorteners.length}). Use full branded links.`,
    });
  }

  // ALL CAPS words (length >= 4).
  const capsWords = words.filter((w) => /^[A-Z]{4,}$/.test(w));
  const capsRatio = words.length > 0 ? capsWords.length / words.length : 0;
  if (capsWords.length >= 2 || capsRatio > 0.1) {
    signals.push({
      key: "all_caps",
      penalty: Math.min(1.5, capsWords.length * 0.4),
      detail: `Excessive ALL-CAPS words (${capsWords.length}). Use normal casing.`,
    });
  }

  // Excessive punctuation (!!! or ???).
  const bangs = (body.match(/!/g) ?? []).length;
  const exclaimRuns = (body.match(/[!?]{2,}/g) ?? []).length;
  if (bangs > 3 || exclaimRuns > 0) {
    signals.push({
      key: "punctuation",
      penalty: Math.min(1.5, bangs * 0.2 + exclaimRuns * 0.6),
      detail: `Excessive punctuation (${bangs} exclamation marks). Tone it down.`,
    });
  }

  // Subject line length.
  if (subject.length > 65) {
    signals.push({
      key: "subject_length",
      penalty: 0.6,
      detail: `Subject is long (${subject.length} chars). Aim for under 60.`,
    });
  } else if (subject.length < 3) {
    signals.push({
      key: "subject_empty",
      penalty: 1.0,
      detail: "Subject is missing or too short.",
    });
  }

  // Emoji in subject.
  const emojiRe =
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;
  if (emojiRe.test(subject)) {
    signals.push({
      key: "subject_emoji",
      penalty: 0.5,
      detail: "Emoji in subject line can trigger filters for cold outreach.",
    });
  }

  // Missing plain-text balance for HTML.
  if (/<[a-z][\s\S]*>/i.test(body) && plain.trim().length < 40) {
    signals.push({
      key: "thin_text",
      penalty: 1.0,
      detail: "HTML email with very little text content.",
    });
  }

  const score = signals.reduce((s, x) => s + x.penalty, 0);
  return {
    signals,
    score,
    metrics: {
      wordCount: words.length,
      linkCount: links.length,
      imageCount: imgCount,
      capsWords: capsWords.length,
      exclamations: bangs,
      subjectLength: subject.length,
    },
  };
}
