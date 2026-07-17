"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
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
  const [error, setError] = useState<string | null>(null);

  function reverify() {
    setError(null);
    startTransition(async () => {
      const res = await reverifyMailbox({ mailboxId });
      if (res.ok && !res.data.verified) {
        setError(res.data.error ?? "Connection failed");
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  }

  function remove() {
    if (
      !window.confirm(
        `Disconnect ${email}? Its warmup config and send history references will be removed.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await deleteMailbox({ mailboxId });
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {error && (
        <span className="mr-2 max-w-48 truncate text-xs text-destructive" title={error}>
          {error}
        </span>
      )}
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
        onClick={remove}
        disabled={pending}
        title="Disconnect mailbox"
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}
