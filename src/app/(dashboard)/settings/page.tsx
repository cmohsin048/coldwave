import { eq, desc, and, isNull, gt } from "drizzle-orm";
import { db } from "@/db";
import { suppressions, memberships, users, invitations } from "@/db/schema";
import { requireOrgContext, getActiveOrg } from "@/lib/tenant";
import { getUsageTotals, isStripeConfigured } from "@/modules/billing/stripe";
import { getEnv } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrgForm } from "./org-form";
import { BillingCard } from "./billing-card";
import { TeamCard } from "./team-card";
import { AddSuppressionForm } from "./suppression-form";
import { formatNumber } from "@/lib/utils";
import { MailCheck, Target } from "lucide-react";

export default async function SettingsPage() {
  const ctx = await requireOrgContext();
  const [org, usage, suppressed, members, pendingInvites] = await Promise.all([
    getActiveOrg(),
    getUsageTotals(ctx.orgId),
    db
      .select()
      .from(suppressions)
      .where(eq(suppressions.orgId, ctx.orgId))
      .orderBy(desc(suppressions.suppressedAt))
      .limit(50),
    db
      .select({
        membershipId: memberships.id,
        userId: memberships.userId,
        role: memberships.role,
        name: users.name,
        email: users.email,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.orgId, ctx.orgId)),
    db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.orgId, ctx.orgId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date())
        )
      )
      .orderBy(desc(invitations.createdAt)),
  ]);

  const canManage = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Workspace, team, compliance, billing, and suppression list."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          title="Emails sent (this month)"
          value={formatNumber(usage.email_sent)}
          icon={MailCheck}
          hint="Metered for billing"
        />
        <StatCard
          title="Leads enriched (this month)"
          value={formatNumber(usage.lead_enriched)}
          icon={Target}
          hint="Metered for billing"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspace & compliance</CardTitle>
        </CardHeader>
        <CardContent>
          <OrgForm
            name={org?.name ?? ""}
            companyAddress={org?.companyAddress ?? ""}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamCard
            members={members.map((m) => ({
              membershipId: m.membershipId,
              name: m.name,
              email: m.email,
              role: m.role,
              isSelf: m.userId === ctx.userId,
            }))}
            invites={pendingInvites.map((i) => ({
              id: i.id,
              email: i.email,
              role: i.role,
              token: i.token,
              expiresAt: i.expiresAt.toISOString(),
            }))}
            canManage={canManage}
            appUrl={getEnv().APP_URL}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
        </CardHeader>
        <CardContent>
          <BillingCard
            subscribed={!!org?.stripeSubscriptionId}
            configured={isStripeConfigured()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suppression list ({suppressed.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <AddSuppressionForm />
          {suppressed.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No suppressed addresses. Unsubscribes, bounces, and complaints land
              here and are honored on every send.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppressed.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{s.reason}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.suppressedAt.toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
