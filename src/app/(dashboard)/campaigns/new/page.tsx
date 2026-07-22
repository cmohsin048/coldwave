import { requireOrgContext } from "@/lib/tenant";
import { listLeadLists } from "@/modules/leads/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { NewCampaignForm } from "./new-campaign-form";

export default async function NewCampaignPage() {
  const ctx = await requireOrgContext();
  const lists = await listLeadLists(ctx.orgId);

  return (
    <div>
      <PageHeader
        title="New campaign"
        description="Name it, write (or generate) the first email, and pick who receives it — all in one place."
      />
      <NewCampaignForm lists={lists.map((l) => ({ id: l.id, name: l.name }))} />
    </div>
  );
}
