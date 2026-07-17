"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { toggleWarmup } from "./actions";

export function WarmupToggle({
  mailboxId,
  enabled,
}: {
  mailboxId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={enabled}
      disabled={pending}
      onCheckedChange={(v) =>
        startTransition(async () => {
          await toggleWarmup({ mailboxId, enable: v });
          router.refresh();
        })
      }
    />
  );
}
