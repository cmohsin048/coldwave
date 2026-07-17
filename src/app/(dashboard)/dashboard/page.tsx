import { count, eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  leads,
  campaigns,
  mailboxes,
  messages,
} from "@/db/schema";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import { Target, Send, Mail, MailCheck } from "lucide-react";

export default async function DashboardPage() {
  const ctx = await requireOrgContext();

  const [[leadCount], [campaignCount], [mailboxCount], [sentCount]] =
    await Promise.all([
      db.select({ n: count() }).from(leads).where(eq(leads.orgId, ctx.orgId)),
      db
        .select({ n: count() })
        .from(campaigns)
        .where(eq(campaigns.orgId, ctx.orgId)),
      db
        .select({ n: count() })
        .from(mailboxes)
        .where(eq(mailboxes.orgId, ctx.orgId)),
      db
        .select({ n: count() })
        .from(messages)
        .where(
          and(eq(messages.orgId, ctx.orgId), eq(messages.status, "sent"))
        ),
    ]);

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Your outbound at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Leads"
          value={formatNumber(leadCount?.n ?? 0)}
          icon={Target}
          hint="In your database"
        />
        <StatCard
          title="Campaigns"
          value={formatNumber(campaignCount?.n ?? 0)}
          icon={Send}
        />
        <StatCard
          title="Connected mailboxes"
          value={formatNumber(mailboxCount?.n ?? 0)}
          icon={Mail}
        />
        <StatCard
          title="Emails sent"
          value={formatNumber(sentCount?.n ?? 0)}
          icon={MailCheck}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Connect a mailbox and start warmup (Mailboxes → Warmup).</p>
            <p>2. Generate leads from Apollo (Leads → New search).</p>
            <p>3. Design a campaign with the AI Designer.</p>
            <p>4. Run the pre-send spam check, then launch.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Deliverability tips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Keep each mailbox under 40 sends/day while warming.</p>
            <p>• Verify SPF, DKIM, and DMARC for every sending domain.</p>
            <p>• Always keep the one-click unsubscribe header enabled.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
