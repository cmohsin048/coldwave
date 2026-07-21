"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, MailCheck } from "lucide-react";
import { requestPasswordResetAction } from "../actions";

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const email = String(new FormData(e.currentTarget).get("email"));

    const res = await requestPasswordResetAction(email);
    setLoading(false);

    if (!res.ok) {
      toast({
        variant: "destructive",
        title: "Could not send reset link",
        description: res.error,
      });
      return;
    }
    setSentTo(email);
    toast({
      variant: "success",
      title: "Reset link sent",
      description: "If that email has an account, a link is on its way.",
    });
  }

  if (sentTo) {
    return (
      <div className="space-y-3 rounded-md border bg-muted/40 p-4 text-center">
        <MailCheck className="mx-auto h-8 w-8 text-emerald-600" />
        <p className="text-sm font-medium">Check your inbox</p>
        <p className="text-sm text-muted-foreground">
          If an account exists for <span className="font-medium">{sentTo}</span>,
          we&apos;ve emailed a password reset link. It expires in 1 hour.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSentTo(null)}
          className="mt-1"
        >
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Send reset link
      </Button>
    </form>
  );
}
