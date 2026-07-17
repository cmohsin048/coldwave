import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import { getCampaign } from "@/modules/campaigns/queries";
import { listLeadLists } from "@/modules/leads/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { SequenceBuilder } from "./sequence-builder";
import { CampaignControls } from "./campaign-controls";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const data = await getCampaign(ctx.orgId, id);
  if (!data) notFound();

  const lists = await listLeadLists(ctx.orgId);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={data.campaign.name}
        description="Drag steps to design your sequence. Branch on replied / opened / no-open."
        action={
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{data.campaign.status}</Badge>
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
          }))}
        />
      </div>
    </div>
  );
}
