"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { updateOrgSettings } from "./actions";

export function OrgForm({
  name,
  companyAddress,
}: {
  name: string;
  companyAddress: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name, companyAddress });
  const [msg, setMsg] = useState<string | null>(null);

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const res = await updateOrgSettings(form);
      setMsg(res.ok ? "Saved." : res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Workspace name</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </div>
      <div className="space-y-1">
        <Label>Company postal address (CAN-SPAM)</Label>
        <Textarea
          rows={2}
          value={form.companyAddress}
          onChange={(e) =>
            setForm((f) => ({ ...f, companyAddress: e.target.value }))
          }
          placeholder="123 Main St, Suite 100, City, ST 00000, USA"
        />
        <p className="text-xs text-muted-foreground">
          Included in the footer of every campaign email. Required by law.
        </p>
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <Button onClick={submit} disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Save settings
      </Button>
    </div>
  );
}
