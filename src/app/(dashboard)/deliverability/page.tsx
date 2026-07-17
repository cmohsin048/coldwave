import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { sendingDomains } from "@/db/schema";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { SpamTester } from "./spam-tester";
import { DomainsPanel } from "./domains-panel";

export default async function DeliverabilityPage() {
  const ctx = await requireOrgContext();
  const domains = await db
    .select()
    .from(sendingDomains)
    .where(eq(sendingDomains.orgId, ctx.orgId))
    .orderBy(asc(sendingDomains.domain));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deliverability"
        description="Run the pre-send spam engine, check SPF/DKIM/DMARC/rDNS, and look up blacklists before you send."
      />
      <DomainsPanel
        domains={domains.map((d) => ({
          id: d.id,
          domain: d.domain,
          spfValid: d.spfValid,
          dkimValid: d.dkimValid,
          dmarcValid: d.dmarcValid,
          rdnsValid: d.rdnsValid,
          blacklists: (d.blacklists ?? []) as string[],
          healthScore: d.healthScore,
          lastCheckedAt: d.lastCheckedAt?.toISOString() ?? null,
        }))}
      />
      <SpamTester />
    </div>
  );
}
