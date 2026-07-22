"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { deleteCampaign } from "./actions";

export function CampaignRowActions({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          // The whole row is a link to the campaign — don't navigate.
          e.preventDefault();
          e.stopPropagation();
          setConfirmOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete campaign?"
        description={`"${campaignName}" and all its steps, variants, and enrollments will be permanently deleted. Already-sent emails stay in your history.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const res = await deleteCampaign({ campaignId });
          if (res.ok) {
            toast({ variant: "success", title: "Campaign deleted" });
            router.refresh();
          } else {
            toast({
              variant: "destructive",
              title: "Delete failed",
              description: res.error,
            });
          }
        }}
      />
    </>
  );
}
