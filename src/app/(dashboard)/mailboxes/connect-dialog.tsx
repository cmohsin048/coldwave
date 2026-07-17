"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";
import { connectMailbox } from "./actions";

export function ConnectMailboxDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    fromName: "",
    smtpHost: "",
    smtpPort: "587",
    smtpPass: "",
    imapHost: "",
    imapPort: "993",
    imapPass: "",
    dailySendLimit: "40",
    hourlySendLimit: "10",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const res = await connectMailbox({
        email: form.email,
        fromName: form.fromName || undefined,
        provider: "smtp",
        smtpHost: form.smtpHost,
        smtpPort: Number(form.smtpPort),
        smtpSecure: Number(form.smtpPort) === 465,
        smtpPass: form.smtpPass,
        imapHost: form.imapHost || undefined,
        imapPort: form.imapPort ? Number(form.imapPort) : undefined,
        imapPass: form.imapPass || form.smtpPass,
        dailySendLimit: Number(form.dailySendLimit),
        hourlySendLimit: Number(form.hourlySendLimit),
      });
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      setMsg(
        res.data.verified
          ? "Connected and verified."
          : `Saved, but SMTP verification failed: ${res.data.error}`
      );
      router.refresh();
      if (res.data.verified) setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Connect mailbox
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect a sending mailbox</DialogTitle>
          <DialogDescription>
            Credentials are encrypted at rest with AES-256-GCM. Use an app
            password for Gmail/Outlook. We verify the SMTP connection before
            enabling sending.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Email address</Label>
            <Input value={form.email} onChange={set("email")} placeholder="you@yourdomain.com" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>From name</Label>
            <Input value={form.fromName} onChange={set("fromName")} placeholder="Alex from ColdWave" />
          </div>
          <div className="space-y-1">
            <Label>SMTP host</Label>
            <Input value={form.smtpHost} onChange={set("smtpHost")} placeholder="smtp.gmail.com" />
          </div>
          <div className="space-y-1">
            <Label>SMTP port</Label>
            <Input value={form.smtpPort} onChange={set("smtpPort")} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>SMTP password / app password</Label>
            <Input type="password" value={form.smtpPass} onChange={set("smtpPass")} />
          </div>
          <div className="space-y-1">
            <Label>IMAP host (for replies/warmup)</Label>
            <Input value={form.imapHost} onChange={set("imapHost")} placeholder="imap.gmail.com" />
          </div>
          <div className="space-y-1">
            <Label>IMAP port</Label>
            <Input value={form.imapPort} onChange={set("imapPort")} />
          </div>
          <div className="space-y-1">
            <Label>Daily send limit</Label>
            <Input value={form.dailySendLimit} onChange={set("dailySendLimit")} />
          </div>
          <div className="space-y-1">
            <Label>Hourly send limit</Label>
            <Input value={form.hourlySendLimit} onChange={set("hourlySendLimit")} />
          </div>
        </div>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Connect &amp; verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
