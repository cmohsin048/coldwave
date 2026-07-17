/**
 * Spintax expansion + merge-field rendering.
 *
 * Spintax syntax:  {option one|option two|option three}  (supports nesting)
 * Merge fields:    {{firstName}}, {{companyName}}  (double braces)
 *
 * Merge fields are resolved first so they can't be mistaken for spin groups,
 * then one random variant is chosen per spin group. Given a per-recipient seed
 * you get stable-but-varied output across a list.
 */

export interface RenderContext {
  [key: string]: string | number | null | undefined;
}

/** Simple seeded PRNG (mulberry32) so renders are reproducible per lead. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Replace {{merge}} fields. Unknown fields render as empty string. */
export function renderMergeFields(
  template: string,
  ctx: RenderContext
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const val = ctx[key];
    return val == null ? "" : String(val);
  });
}

/** Expand the outermost/nested spin groups picking one option each. */
export function expandSpintax(input: string, rand: () => number): string {
  // Repeatedly resolve the innermost {a|b|c} group until none remain.
  const groupRe = /\{([^{}]*\|[^{}]*)\}/;
  let text = input;
  let guard = 0;
  while (groupRe.test(text) && guard < 1000) {
    text = text.replace(groupRe, (_, body: string) => {
      const options = body.split("|");
      const idx = Math.floor(rand() * options.length);
      return options[idx] ?? "";
    });
    guard++;
  }
  return text;
}

/**
 * Full render: merge fields → spintax. Pass a `seed` (e.g. lead id + step id)
 * for deterministic per-recipient variation.
 */
export function render(
  template: string,
  ctx: RenderContext = {},
  seed?: string
): string {
  const withMerge = renderMergeFields(template, ctx);
  const rand = seededRandom(
    seed ? hashString(seed) : Math.floor(Math.random() * 2 ** 31)
  );
  return expandSpintax(withMerge, rand);
}

/** Count how many unique variants a spintax template can produce (approx). */
export function countVariants(input: string): number {
  const groupRe = /\{([^{}]*\|[^{}]*)\}/;
  let text = input;
  let product = 1;
  let guard = 0;
  while (groupRe.test(text) && guard < 1000) {
    text = text.replace(groupRe, (_, body: string) => {
      product *= body.split("|").length;
      return "•";
    });
    guard++;
  }
  return product;
}
