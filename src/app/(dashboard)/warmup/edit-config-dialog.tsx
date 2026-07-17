"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Settings2 } from "lucide-react";
import { updateWarmupConfig } from "./actions";

export interface WarmupCurve {
  startVolume: number;
  dailyIncrement: number;
  maxVolume: number;
  replyRate: number;
  businessHoursOnly: boolean;
  weekendReduction: boolean;
  timezone: string;
}

export function EditWarmupConfigDialog({
  mailboxId,
  email,
  initial,
}: {
  mailboxId: string;
  email: string;
  initial: WarmupCurve;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<WarmupCurve>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateWarmupConfig({ mailboxId, ...form });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(
          res.fieldErrors
            ? Object.values(res.fieldErrors).flat().join(", ")
            : res.error
        );
      }
    });
  }

  const num =
    (key: "startVolume" | "dailyIncrement" | "maxVolume" | "replyRate") =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: Number(e.target.value) }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Edit warmup curve">
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Warmup curve — {email}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="wu-start">Start volume /day</Label>
            <Input
              id="wu-start"
              type="number"
              min={1}
              max={50}
              value={form.startVolume}
              onChange={num("startVolume")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wu-inc">Daily increment</Label>
            <Input
              id="wu-inc"
              type="number"
              min={1}
              max={20}
              value={form.dailyIncrement}
              onChange={num("dailyIncrement")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wu-max">Max volume /day</Label>
            <Input
              id="wu-max"
              type="number"
              min={5}
              max={200}
              value={form.maxVolume}
              onChange={num("maxVolume")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wu-reply">Reply rate %</Label>
            <Input
              id="wu-reply"
              type="number"
              min={0}
              max={100}
              value={form.replyRate}
              onChange={num("replyRate")}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="wu-tz">Timezone (IANA)</Label>
            <Input
              id="wu-tz"
              value={form.timezone}
              onChange={(e) =>
                setForm((f) => ({ ...f, timezone: e.target.value }))
              }
              placeholder="America/New_York"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Business hours only</Label>
            <Switch
              checked={form.businessHoursOnly}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, businessHoursOnly: v }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Pause weekends</Label>
            <Switch
              checked={form.weekendReduction}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, weekendReduction: v }))
              }
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
