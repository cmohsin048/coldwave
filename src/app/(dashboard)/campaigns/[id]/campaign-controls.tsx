"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Pause, Loader2, UserPlus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { updateCampaignStatus, enrollLeads, deleteCampaign } from "../actions";

export function CampaignControls({
  campaignId,
  status,
  lists,
}: {
  campaignId: string;
  status: string;
  lists: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [listId, setListId] = useState<string | undefined>(lists[0]?.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();

  function setStatus(next: "active" | "paused") {
    startTransition(async () => {
      const res = await updateCampaignStatus({ campaignId, status: next });
      if (res.ok) {
        toast({
          variant: "success",
          title: next === "active" ? "Campaign launched" : "Campaign paused",
          description:
            next === "active"
              ? "The worker will start sending due steps."
              : "Sending is paused; enrollments keep their place.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Status change failed",
          description: res.error,
        });
      }
      router.refresh();
    });
  }

  function enroll() {
    if (!listId) return;
    startTransition(async () => {
      const res = await enrollLeads({ campaignId, listId });
      if (res.ok) {
        toast({
          variant: "success",
          title: "Leads enrolled",
          description: `Enrolled ${res.data.enrolled} of ${res.data.total}${
            res.data.skippedSuppressed
              ? ` (${res.data.skippedSuppressed} suppressed/blocked skipped)`
              : ""
          }.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Enrollment failed",
          description: res.error,
        });
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {lists.length > 0 && (
        <>
          <Select value={listId} onValueChange={setListId}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="Lead list" />
            </SelectTrigger>
            <SelectContent>
              {lists.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={enroll} disabled={pending}>
            <UserPlus className="h-4 w-4" />
            Enroll
          </Button>
        </>
      )}
      {status === "active" ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setStatus("paused")}
          disabled={pending}
        >
          <Pause className="h-4 w-4" />
          Pause
        </Button>
      ) : (
        <Button size="sm" onClick={() => setStatus("active")} disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Launch
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setConfirmDelete(true)}
        disabled={pending}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete campaign?"
        description="This campaign and all its steps, variants, and enrollments will be permanently deleted. Already-sent emails stay in your history."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          // On success the action redirects to /campaigns server-side (so the
          // deleted page never re-renders); res is only set on failure.
          const res = await deleteCampaign({
            campaignId,
            redirectTo: "/campaigns",
          });
          if (res && !res.ok) {
            toast({
              variant: "destructive",
              title: "Delete failed",
              description: res.error,
            });
          } else {
            toast({ variant: "success", title: "Campaign deleted" });
          }
        }}
      />
    </div>
  );
}
