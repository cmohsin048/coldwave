import { promises as dns } from "node:dns";

/**
 * DNS-based authentication checks for a sending domain: SPF, DKIM, DMARC, and
 * reverse DNS (rDNS) for a sending IP. Plus DNSBL blacklist lookups against
 * Spamhaus, Barracuda, and SORBS.
 *
 * These use only Node's dns.promises — no third-party API needed.
 */

export interface DnsAuthResult {
  spf: { present: boolean; record?: string };
  dkim: { present: boolean; selector?: string };
  dmarc: { present: boolean; policy?: string; record?: string };
  rdns: { valid: boolean; hostname?: string };
}

async function txtRecords(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

export async function checkSpf(domain: string) {
  const txts = await txtRecords(domain);
  const spf = txts.find((t) => t.toLowerCase().startsWith("v=spf1"));
  return { present: !!spf, record: spf };
}

export async function checkDkim(domain: string, selectors = ["google", "default", "selector1", "selector2", "k1", "s1"]) {
  for (const selector of selectors) {
    const txts = await txtRecords(`${selector}._domainkey.${domain}`);
    const dkim = txts.find((t) => /v=dkim1/i.test(t) || /p=/.test(t));
    if (dkim) return { present: true, selector };
  }
  return { present: false as const };
}

export async function checkDmarc(domain: string) {
  const txts = await txtRecords(`_dmarc.${domain}`);
  const dmarc = txts.find((t) => t.toLowerCase().startsWith("v=dmarc1"));
  const policyMatch = dmarc?.match(/p=(none|quarantine|reject)/i);
  return {
    present: !!dmarc,
    policy: policyMatch?.[1]?.toLowerCase(),
    record: dmarc,
  };
}

export async function checkRdns(ip?: string) {
  if (!ip) return { valid: false };
  try {
    const hostnames = await dns.reverse(ip);
    if (hostnames.length === 0) return { valid: false };
    // Forward-confirm: the PTR host should resolve back to the IP.
    const hostname = hostnames[0]!;
    const forward = await dns.resolve(hostname).catch(() => [] as string[]);
    return { valid: forward.includes(ip), hostname };
  } catch {
    return { valid: false };
  }
}

export async function checkDnsAuth(
  domain: string,
  sendingIp?: string
): Promise<DnsAuthResult> {
  const [spf, dkim, dmarc, rdns] = await Promise.all([
    checkSpf(domain),
    checkDkim(domain),
    checkDmarc(domain),
    checkRdns(sendingIp),
  ]);
  return { spf, dkim, dmarc, rdns };
}

/** DNSBL blacklists to query (reverse-IP + zone). */
const DNSBL_ZONES: Array<{ name: string; zone: string }> = [
  { name: "Spamhaus ZEN", zone: "zen.spamhaus.org" },
  { name: "Barracuda", zone: "b.barracudacentral.org" },
  { name: "SORBS", zone: "dnsbl.sorbs.net" },
];

function reverseIp(ip: string): string {
  return ip.split(".").reverse().join(".");
}

/**
 * Query DNSBLs for a sending IP. A positive A-record response means listed.
 * Returns the list of blacklists the IP appears on.
 */
export async function checkBlacklists(ip?: string): Promise<string[]> {
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return [];
  const reversed = reverseIp(ip);
  const results = await Promise.all(
    DNSBL_ZONES.map(async ({ name, zone }) => {
      try {
        const answers = await dns.resolve4(`${reversed}.${zone}`);
        return answers.length > 0 ? name : null;
      } catch {
        return null; // NXDOMAIN = not listed
      }
    })
  );
  return results.filter((r): r is string => r !== null);
}
