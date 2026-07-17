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
import { Play, Pause, Loader2, UserPlus } from "lucide-react";
import { updateCampaignStatus, enrollLeads } from "../actions";

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
  const [msg, setMsg] = useState<string | null>(null);

  function setStatus(next: "active" | "paused") {
    startTransition(async () => {
      await updateCampaignStatus({ campaignId, status: next });
      router.refresh();
    });
  }

  function enroll() {
    if (!listId) return;
    setMsg(null);
    startTransition(async () => {
      const res = await enrollLeads({ campaignId, listId });
      setMsg(
        res.ok
          ? `Enrolled ${res.data.enrolled} of ${res.data.total}.`
          : res.error
      );
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
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
