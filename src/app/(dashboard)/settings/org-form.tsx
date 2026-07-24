"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { updateOrgSettings } from "./actions";

type ReplyNotificationMode = "off" | "positive_only" | "all";

export function OrgForm({
  name,
  companyAddress,
  notificationEmail,
  replyNotificationMode,
  ownerEmail,
}: {
  name: string;
  companyAddress: string;
  notificationEmail: string;
  replyNotificationMode: ReplyNotificationMode;
  ownerEmail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name,
    companyAddress,
    notificationEmail,
    replyNotificationMode,
  });
  const { toast } = useToast();

  function submit() {
    startTransition(async () => {
      const res = await updateOrgSettings(form);
      if (res.ok) {
        toast({ variant: "success", title: "Workspace settings saved" });
      } else {
        toast({
          variant: "destructive",
          title: "Save failed",
          description: res.error,
        });
      }
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Reply alerts</Label>
          <Select
            value={form.replyNotificationMode}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                replyNotificationMode: v as ReplyNotificationMode,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="positive_only">
                Positive replies only
              </SelectItem>
              <SelectItem value="all">Every reply</SelectItem>
              <SelectItem value="off">Off</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Get an email when a lead responds to a campaign.
          </p>
        </div>
        <div className="space-y-1">
          <Label>Notification email</Label>
          <Input
            type="email"
            value={form.notificationEmail}
            onChange={(e) =>
              setForm((f) => ({ ...f, notificationEmail: e.target.value }))
            }
            placeholder={ownerEmail || "admin@yourcompany.com"}
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to send alerts to the workspace owner
            {ownerEmail ? ` (${ownerEmail})` : ""}.
          </p>
        </div>
      </div>
      <Button onClick={submit} disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Save settings
      </Button>
    </div>
  );
}
