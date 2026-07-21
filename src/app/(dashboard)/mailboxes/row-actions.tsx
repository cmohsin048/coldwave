"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { deleteMailbox, reverifyMailbox } from "./actions";

export function MailboxRowActions({
  mailboxId,
  email,
}: {
  mailboxId: string;
  email: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  function reverify() {
    startTransition(async () => {
      const res = await reverifyMailbox({ mailboxId });
      if (res.ok && res.data.verified) {
        toast({
          variant: "success",
          title: "Connection verified",
          description: `${email} connected successfully.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Connection failed",
          description: res.ok
            ? (res.data.error ?? "Connection failed")
            : res.error,
        });
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteMailbox({ mailboxId });
      if (res.ok) {
        toast({
          variant: "success",
          title: "Mailbox disconnected",
          description: `${email} has been removed.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Disconnect failed",
          description: res.error,
        });
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        size="icon"
        variant="ghost"
        onClick={reverify}
        disabled={pending}
        title="Re-verify connection"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
        title="Disconnect mailbox"
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Disconnect ${email}?`}
        description="Its warmup config and send history references will be removed."
        confirmLabel="Disconnect"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
