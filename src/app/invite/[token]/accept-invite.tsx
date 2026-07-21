"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
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
  const { toast } = useToast();

  function accept() {
    startTransition(async () => {
      const res = await acceptInvitation(token);
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not join workspace",
          description: res.error,
        });
        return;
      }
      toast({ variant: "success", title: `Welcome to ${orgName}` });
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
    </div>
  );
}
