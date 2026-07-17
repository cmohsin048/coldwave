import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sendingDomains, type SendingDomain } from "@/db/schema";
import { checkDnsAuth, checkBlacklists } from "./dns-auth";

/**
 * Re-check one sending domain's SPF/DKIM/DMARC/rDNS + blacklist status and
 * persist the cached result. Returns the fresh values.
 */
export async function refreshDomainHealth(domain: SendingDomain) {
  const dns = await checkDnsAuth(domain.domain);
  const blacklists = await checkBlacklists(); // per-IP checks wired when IPs are tracked
  const healthScore =
    (dns.spf.present ? 30 : 0) +
    (dns.dkim.present ? 30 : 0) +
    (dns.dmarc.present ? 25 : 0) +
    (blacklists.length === 0 ? 15 : 0);
  await db
    .update(sendingDomains)
    .set({
      spfValid: dns.spf.present,
      dkimValid: dns.dkim.present,
      dmarcValid: dns.dmarc.present,
      rdnsValid: dns.rdns.valid,
      blacklists,
      healthScore,
      lastCheckedAt: new Date(),
    })
    .where(eq(sendingDomains.id, domain.id));
  return { dns, blacklists, healthScore };
}

/**
 * Refresh cached SPF/DKIM/DMARC/rDNS + blacklist status for every sending
 * domain. Invoked by the repeatable `domain-health` job.
 */
export async function refreshAllDomainHealth(): Promise<number> {
  const domains = await db.select().from(sendingDomains);
  for (const d of domains) {
    await refreshDomainHealth(d);
  }
  return domains.length;
}
