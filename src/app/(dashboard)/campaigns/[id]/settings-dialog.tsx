"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Settings2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { updateCampaignSettings } from "../actions";

export interface CampaignSettings {
  mailboxPool: string[];
  sendPerTimezone: boolean;
  trackOpens: boolean;
  trackClicks: boolean;
  dailyCap: number | null;
  scheduledStartAt: string | null; // ISO
}

/** Format an ISO timestamp for a datetime-local input (local time, no tz). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CampaignSettingsDialog({
  campaignId,
  initial,
  mailboxes,
}: {
  campaignId: string;
  initial: CampaignSettings;
  mailboxes: Array<{ id: string; email: string; status: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const [pool, setPool] = useState<Set<string>>(new Set(initial.mailboxPool));
  const [sendPerTimezone, setSendPerTimezone] = useState(initial.sendPerTimezone);
  const [trackOpens, setTrackOpens] = useState(initial.trackOpens);
  const [trackClicks, setTrackClicks] = useState(initial.trackClicks);
  const [dailyCap, setDailyCap] = useState(
    initial.dailyCap != null ? String(initial.dailyCap) : ""
  );
  const [startAt, setStartAt] = useState(toLocalInput(initial.scheduledStartAt));

  function togglePool(id: string) {
    setPool((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const res = await updateCampaignSettings({
        campaignId,
        mailboxPool: [...pool],
        sendPerTimezone,
        trackOpens,
        trackClicks,
        dailyCap: dailyCap.trim() ? Number(dailyCap) : null,
        scheduledStartAt: startAt ? new Date(startAt).toISOString() : null,
      });
      if (res.ok) {
        toast({
          variant: "success",
          title: "Sending settings saved",
          description:
            res.data.status === "scheduled"
              ? "Campaign is scheduled and will start automatically."
              : undefined,
        });
        setOpen(false);
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Save failed",
          description: res.fieldErrors
            ? Object.values(res.fieldErrors).flat().join(", ")
            : res.error,
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" title="Sending settings">
          <Settings2 className="h-4 w-4" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sending settings</DialogTitle>
          <DialogDescription>
            Mailbox rotation pool, tracking, daily cap, and scheduled start for
            this campaign.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Mailbox pool</Label>
            {mailboxes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No mailboxes connected yet — connect one under Mailboxes.
              </p>
            ) : (
              <div className="space-y-1 rounded-md border p-2">
                {mailboxes.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={pool.has(m.id)}
                      onChange={() => togglePool(m.id)}
                    />
                    <span className="truncate">{m.email}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {m.status}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Leave all unchecked to rotate across every active mailbox.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cs-cap">Daily cap (emails/day)</Label>
              <Input
                id="cs-cap"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={dailyCap}
                onChange={(e) => setDailyCap(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-start">Scheduled start</Label>
              <Input
                id="cs-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Send in lead&apos;s timezone</Label>
                <p className="text-xs text-muted-foreground">
                  Hold sends until the lead&apos;s local business hours.
                </p>
              </div>
              <Switch
                checked={sendPerTimezone}
                onCheckedChange={setSendPerTimezone}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Track opens</Label>
              <Switch checked={trackOpens} onCheckedChange={setTrackOpens} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Track clicks</Label>
              <Switch checked={trackClicks} onCheckedChange={setTrackClicks} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
