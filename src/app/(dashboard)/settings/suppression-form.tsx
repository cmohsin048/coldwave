"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, ShieldBan } from "lucide-react";
import { addSuppressionEntry } from "./actions";

/** Manually add an address to the global suppression list. */
export function AddSuppressionForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function submit() {
    if (!email.trim()) return;
    startTransition(async () => {
      const res = await addSuppressionEntry({ email: email.trim() });
      if (res.ok) {
        toast({
          variant: "success",
          title: "Address suppressed",
          description: `${email.trim()} will never be emailed again.`,
        });
        setEmail("");
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Could not suppress",
          description: res.fieldErrors
            ? Object.values(res.fieldErrors).flat().join(", ")
            : res.error,
        });
      }
    });
  }

  return (
    <div className="mb-4 flex gap-2">
      <Input
        type="email"
        placeholder="never-email@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="max-w-xs"
      />
      <Button
        variant="outline"
        onClick={submit}
        disabled={pending || !email.trim()}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldBan className="h-4 w-4" />
        )}
        Suppress
      </Button>
    </div>
  );
}
