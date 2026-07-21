import { eq, desc, and, isNull, gt } from "drizzle-orm";
import { db } from "@/db";
import { suppressions, memberships, users, invitations } from "@/db/schema";
import { requireOrgContext, getActiveOrg } from "@/lib/tenant";
import { getEnv } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/page-header";
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
import { TeamCard } from "./team-card";
import { AddSuppressionForm } from "./suppression-form";

export default async function SettingsPage() {
  const ctx = await requireOrgContext();
  const [org, suppressed, members, pendingInvites] = await Promise.all([
    getActiveOrg(),
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
        description="Workspace, team, compliance, and suppression list."
      />

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
