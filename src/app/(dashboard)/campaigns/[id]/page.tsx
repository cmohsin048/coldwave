import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes } from "@/db/schema";
import { requireOrgContext } from "@/lib/tenant";
import { getCampaign } from "@/modules/campaigns/queries";
import { listLeadLists } from "@/modules/leads/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { SequenceBuilder } from "./sequence-builder";
import { CampaignControls } from "./campaign-controls";
import { CampaignSettingsDialog } from "./settings-dialog";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const data = await getCampaign(ctx.orgId, id);
  if (!data) notFound();

  const [lists, orgMailboxes] = await Promise.all([
    listLeadLists(ctx.orgId),
    db
      .select({
        id: mailboxes.id,
        email: mailboxes.email,
        status: mailboxes.status,
      })
      .from(mailboxes)
      .where(eq(mailboxes.orgId, ctx.orgId)),
  ]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={data.campaign.name}
        description="Drag steps to design your sequence. Branch on replied / opened / no-open."
        action={
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{data.campaign.status}</Badge>
            <CampaignSettingsDialog
              campaignId={data.campaign.id}
              initial={{
                mailboxPool: (data.campaign.mailboxPool ?? []) as string[],
                sendPerTimezone: data.campaign.sendPerTimezone,
                trackOpens: data.campaign.trackOpens,
                trackClicks: data.campaign.trackClicks,
                dailyCap: data.campaign.dailyCap,
                scheduledStartAt:
                  data.campaign.scheduledStartAt?.toISOString() ?? null,
              }}
              mailboxes={orgMailboxes}
            />
            <CampaignControls
              campaignId={data.campaign.id}
              status={data.campaign.status}
              lists={lists.map((l) => ({ id: l.id, name: l.name }))}
            />
          </div>
        }
      />
      <div className="min-h-[560px] flex-1 overflow-hidden rounded-lg border">
        <SequenceBuilder
          campaignId={data.campaign.id}
          initialSteps={data.steps.map((s) => ({
            id: s.id,
            type: s.type,
            stage: s.stage,
            order: s.order,
            subject: s.subject ?? "",
            body: s.body ?? "",
            delayDays: s.delayDays,
            delayHours: s.delayHours,
            nextIfReplied: s.nextIfReplied,
            nextIfOpened: s.nextIfOpened,
            nextIfNoOpen: s.nextIfNoOpen,
            position: s.position ?? { x: 250, y: 80 + s.order * 180 },
            variants: s.variants.map((v) => ({
              id: v.id,
              label: v.label,
              subject: v.subject ?? "",
              body: v.body ?? "",
              weight: v.weight,
              isWinner: v.isWinner,
              sent: v.sent,
              opens: v.opens,
              clicks: v.clicks,
              replies: v.replies,
            })),
          }))}
        />
      </div>
    </div>
  );
}
