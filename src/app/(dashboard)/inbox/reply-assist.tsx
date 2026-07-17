"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Send, Check } from "lucide-react";
import { suggestReplyAction, sendReplyAction } from "./actions";

export function ReplyAssist({ messageId }: { messageId: string }) {
  const [pending, startTransition] = useTransition();
  const [sending, startSending] = useTransition();
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await suggestReplyAction({ messageId });
      if (res.ok) setDraft(res.data.draft);
      else setError(res.error);
    });
  }

  function send() {
    setError(null);
    startSending(async () => {
      const res = await sendReplyAction({ messageId, body: draft });
      if (res.ok) setSent(true);
      else setError(res.error);
    });
  }

  if (sent) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-emerald-600">
        <Check className="h-4 w-4" /> Reply sent
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" onClick={generate} disabled={pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Suggest reply
      </Button>
      {draft && (
        <>
          <Textarea
            rows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button size="sm" onClick={send} disabled={sending || !draft.trim()}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send reply
          </Button>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
