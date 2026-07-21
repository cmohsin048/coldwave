import { requireOrgContext } from "@/lib/tenant";
import {
  orgEventTotals,
  campaignPerformance,
  domainScorecard,
  funnelStageTotals,
  rate,
} from "@/modules/analytics/queries";
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
import { FunnelChart } from "./funnel-chart";
import { formatNumber, formatPercent } from "@/lib/utils";
import { MailCheck, Eye, MousePointerClick, Reply } from "lucide-react";

export default async function AnalyticsPage() {
  const ctx = await requireOrgContext();
  const [totals, perf, domains, stages] = await Promise.all([
    orgEventTotals(ctx.orgId),
    campaignPerformance(ctx.orgId),
    domainScorecard(ctx.orgId),
    funnelStageTotals(ctx.orgId),
  ]);

  const funnelData = [
    { stage: "Sent", count: totals.sent },
    { stage: "Delivered", count: totals.delivered },
    { stage: "Opened", count: totals.open },
    { stage: "Clicked", count: totals.click },
    { stage: "Replied", count: totals.reply },
  ];

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Sent, delivered, open, click, reply, bounce, and spam rates — plus domain health."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Sent"
          value={formatNumber(totals.sent)}
          icon={MailCheck}
        />
        <StatCard
          title="Open rate"
          value={formatPercent(rate(totals.open, totals.sent))}
          icon={Eye}
          hint={`${formatNumber(totals.open)} opens`}
        />
        <StatCard
          title="Click rate"
          value={formatPercent(rate(totals.click, totals.sent))}
          icon={MousePointerClick}
          hint={`${formatNumber(totals.click)} clicks`}
        />
        <StatCard
          title="Reply rate"
          value={formatPercent(rate(totals.reply, totals.sent))}
          icon={Reply}
          hint={`${formatNumber(totals.reply)} replies`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Engagement funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelChart data={funnelData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Domain health scorecard</CardTitle>
          </CardHeader>
          <CardContent>
            {domains.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No sending domains yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>SPF</TableHead>
                    <TableHead>DKIM</TableHead>
                    <TableHead>DMARC</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domains.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.domain}</TableCell>
                      <TableCell>
                        <AuthDot ok={d.spfValid} />
                      </TableCell>
                      <TableCell>
                        <AuthDot ok={d.dkimValid} />
                      </TableCell>
                      <TableCell>
                        <AuthDot ok={d.dmarcValid} />
                      </TableCell>
                      <TableCell>{d.healthScore ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Funnel stage conversion</CardTitle>
        </CardHeader>
        <CardContent>
          {stages.every((s) => s.entered === 0) ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No stage activity yet — enroll leads into a campaign to populate
              the awareness → interest → demo → close funnel.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead>Entered</TableHead>
                  <TableHead>Converted</TableHead>
                  <TableHead>Conversion rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stages.map((s) => (
                  <TableRow key={s.stage}>
                    <TableCell className="font-medium capitalize">
                      {s.stage}
                    </TableCell>
                    <TableCell>{formatNumber(s.entered)}</TableCell>
                    <TableCell>{formatNumber(s.converted)}</TableCell>
                    <TableCell>{formatPercent(s.rate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Campaign performance</CardTitle>
        </CardHeader>
        <CardContent>
          {perf.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No campaign activity yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Opens</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Replies</TableHead>
                  <TableHead>Bounces</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perf.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{formatNumber(c.totals.sent)}</TableCell>
                    <TableCell>{formatNumber(c.totals.open)}</TableCell>
                    <TableCell>{formatNumber(c.totals.click)}</TableCell>
                    <TableCell>{formatNumber(c.totals.reply)}</TableCell>
                    <TableCell>{formatNumber(c.totals.bounce)}</TableCell>
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

function AuthDot({ ok }: { ok: boolean | null }) {
  if (ok === null)
    return <Badge variant="secondary">?</Badge>;
  return (
    <Badge variant={ok ? "success" : "danger"}>{ok ? "Pass" : "Fail"}</Badge>
  );
}
