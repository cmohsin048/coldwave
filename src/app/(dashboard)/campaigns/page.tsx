import Link from "next/link";
import { requireOrgContext } from "@/lib/tenant";
import { listCampaigns } from "@/modules/campaigns/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CampaignRowActions } from "./campaign-row-actions";

const statusVariant: Record<
  string,
  "success" | "warning" | "secondary" | "default"
> = {
  active: "success",
  scheduled: "warning",
  paused: "warning",
  draft: "secondary",
  completed: "default",
  archived: "secondary",
};

export default async function CampaignsPage() {
  const ctx = await requireOrgContext();
  const rows = await listCampaigns(ctx.orgId);

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Design multi-step sequences, run the pre-send spam check, and launch."
        action={
          <Button asChild>
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4" />
              New campaign
            </Link>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No campaigns yet. Create one — you can write the emails yourself
            or generate them with AI.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {c.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant[c.status] ?? "secondary"}>
                      {c.status}
                    </Badge>
                    <CampaignRowActions
                      campaignId={c.id}
                      campaignName={c.name}
                    />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
