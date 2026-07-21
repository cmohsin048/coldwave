"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { startCheckout, openBillingPortal } from "./actions";

export function BillingCard({
  subscribed,
  configured,
}: {
  subscribed: boolean;
  configured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function go(fn: typeof startCheckout) {
    startTransition(async () => {
      const res = await fn({});
      if (res.ok) window.location.href = res.data.url;
      else
        toast({
          variant: "destructive",
          title: "Billing error",
          description: res.error,
        });
    });
  }

  if (!configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Billing is not configured on this deployment (set{" "}
        <code>STRIPE_SECRET_KEY</code> and price ids to enable subscriptions).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Plan:</span>
        {subscribed ? (
          <Badge>Metered — active</Badge>
        ) : (
          <Badge variant="secondary">No subscription</Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Usage-based pricing: you pay per email sent and per lead enriched.
        Usage is reported to Stripe hourly.
      </p>
      <div className="flex gap-2">
        {!subscribed && (
          <Button size="sm" onClick={() => go(startCheckout)} disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Subscribe
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => go(openBillingPortal)}
          disabled={pending}
        >
          <ExternalLink className="h-4 w-4" />
          Billing portal
        </Button>
      </div>
    </div>
  );
}
