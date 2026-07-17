"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";
import { createCampaign } from "./actions";

export function CreateCampaignButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name) return;
    startTransition(async () => {
      const res = await createCampaign({ name });
      if (res.ok) router.push(`/campaigns/${res.data.campaignId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New campaign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Campaign name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !name}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
