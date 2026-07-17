"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";
import { acceptInvitation } from "./actions";

export function AcceptInvite({
  token,
  orgName,
}: {
  token: string;
  orgName: string;
}) {
  const router = useRouter();
  const { update } = useSession();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function accept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptInvitation(token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Switch the JWT's active org to the one just joined, then land on it.
      await update({ activeOrgId: res.orgId });
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={accept} disabled={pending} className="w-full">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        Join {orgName}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
