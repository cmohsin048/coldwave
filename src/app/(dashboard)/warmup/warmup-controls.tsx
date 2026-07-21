"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
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
  const { toast } = useToast();

  return (
    <Switch
      checked={enabled}
      disabled={pending}
      onCheckedChange={(v) =>
        startTransition(async () => {
          const res = await toggleWarmup({ mailboxId, enable: v });
          if (res.ok) {
            toast({
              variant: "success",
              title: v ? "Warmup enabled" : "Warmup disabled",
            });
          } else {
            toast({
              variant: "destructive",
              title: "Warmup toggle failed",
              description: res.error,
            });
          }
          router.refresh();
        })
      }
    />
  );
}
