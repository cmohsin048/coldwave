import { eq, desc, and, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes, warmupConfigs, warmupStats } from "@/db/schema";
import { requireOrgContext } from "@/lib/tenant";
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
import { WarmupToggle } from "./warmup-controls";
import { EditWarmupConfigDialog } from "./edit-config-dialog";
import { PlacementChart } from "./placement-chart";

export default async function WarmupPage() {
  const ctx = await requireOrgContext();

  const rows = await db
    .select({ mailbox: mailboxes, config: warmupConfigs })
    .from(mailboxes)
    .leftJoin(warmupConfigs, eq(warmupConfigs.mailboxId, mailboxes.id))
    .where(eq(mailboxes.orgId, ctx.orgId))
    .orderBy(desc(mailboxes.createdAt));

  // Aggregate inbox placement over the last 30 days for the trend chart.
  // `sent`/`inbox`/`spam` are recorded on the sending mailbox, bucketed by the
  // recipient's provider — so inbox/sent is the true placement rate.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [stats, providerStats] = await Promise.all([
    db
      .select({
        day: warmupStats.day,
        inbox: sql<number>`sum(${warmupStats.inbox})::int`,
        sent: sql<number>`sum(${warmupStats.sent})::int`,
      })
      .from(warmupStats)
      .where(and(eq(warmupStats.orgId, ctx.orgId), gte(warmupStats.day, since)))
      .groupBy(warmupStats.day)
      .orderBy(warmupStats.day),
    db
      .select({
        provider: warmupStats.provider,
        sent: sql<number>`sum(${warmupStats.sent})::int`,
        inbox: sql<number>`sum(${warmupStats.inbox})::int`,
        spam: sql<number>`sum(${warmupStats.spam})::int`,
        replied: sql<number>`sum(${warmupStats.replied})::int`,
      })
      .from(warmupStats)
      .where(and(eq(warmupStats.orgId, ctx.orgId), gte(warmupStats.day, since)))
      .groupBy(warmupStats.provider)
      .orderBy(warmupStats.provider),
  ]);

  const chartData = stats.map((s) => ({
    day: s.day.slice(5),
    inboxRate: s.sent > 0 ? Math.round((s.inbox / s.sent) * 100) : 0,
  }));

  return (
    <div>
      <PageHeader
        title="Warmup"
        description="Peer-to-peer mailbox warmup with a daily ramp and human-like timing. Enable it per mailbox before running campaigns."
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Inbox placement (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <PlacementChart data={chartData} />
          </CardContent>
        </Card>

        {providerStats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Placement by provider (30 days)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Inbox</TableHead>
                    <TableHead>Spam</TableHead>
                    <TableHead>Replies</TableHead>
                    <TableHead>Inbox rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providerStats.map((p) => (
                    <TableRow key={p.provider}>
                      <TableCell className="font-medium capitalize">
                        {p.provider}
                      </TableCell>
                      <TableCell>{p.sent}</TableCell>
                      <TableCell>{p.inbox}</TableCell>
                      <TableCell>{p.spam}</TableCell>
                      <TableCell>{p.replied}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            p.sent === 0
                              ? "secondary"
                              : p.inbox / p.sent >= 0.9
                                ? "success"
                                : p.inbox / p.sent >= 0.7
                                  ? "warning"
                                  : "danger"
                          }
                        >
                          {p.sent > 0
                            ? `${Math.round((p.inbox / p.sent) * 100)}%`
                            : "—"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Mailboxes</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Connect a mailbox first to start warming.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mailbox</TableHead>
                    <TableHead>Warmup status</TableHead>
                    <TableHead>Current volume</TableHead>
                    <TableHead>Target cap</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ mailbox, config }) => (
                    <TableRow key={mailbox.id}>
                      <TableCell className="font-medium">
                        {mailbox.email}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            config?.status === "maintaining"
                              ? "success"
                              : config?.status === "ramping"
                                ? "warning"
                                : "secondary"
                          }
                        >
                          {config?.status ?? "disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell>{config?.currentVolume ?? 0}/day</TableCell>
                      <TableCell>{config?.maxVolume ?? 40}/day</TableCell>
                      <TableCell>
                        <WarmupToggle
                          mailboxId={mailbox.id}
                          enabled={
                            config?.status === "ramping" ||
                            config?.status === "maintaining"
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {config && (
                          <EditWarmupConfigDialog
                            mailboxId={mailbox.id}
                            email={mailbox.email}
                            initial={{
                              startVolume: config.startVolume,
                              dailyIncrement: config.dailyIncrement,
                              maxVolume: config.maxVolume,
                              replyRate: config.replyRate,
                              businessHoursOnly: config.businessHoursOnly,
                              weekendReduction: config.weekendReduction,
                              timezone: config.timezone,
                            }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
