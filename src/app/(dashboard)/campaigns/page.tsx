import Link from "next/link";
import { requireOrgContext } from "@/lib/tenant";
import { listCampaigns } from "@/modules/campaigns/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { CreateCampaignButton } from "./create-button";

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
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/designer">
                <Sparkles className="h-4 w-4" />
                AI Designer
              </Link>
            </Button>
            <CreateCampaignButton />
          </div>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No campaigns yet. Start from scratch or use the AI Designer.
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
                  <Badge variant={statusVariant[c.status] ?? "secondary"}>
                    {c.status}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
