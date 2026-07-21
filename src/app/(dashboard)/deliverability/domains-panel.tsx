"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  RefreshCw,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  addSendingDomain,
  recheckSendingDomain,
  deleteSendingDomain,
} from "./actions";

export interface DomainRow {
  id: string;
  domain: string;
  spfValid: boolean | null;
  dkimValid: boolean | null;
  dmarcValid: boolean | null;
  rdnsValid: boolean | null;
  blacklists: string[];
  healthScore: number | null;
  lastCheckedAt: string | null;
}

function AuthBadge({ label, ok }: { label: string; ok: boolean | null }) {
  return (
    <Badge variant={ok === null ? "secondary" : ok ? "success" : "danger"}>
      {label} {ok === null ? "—" : ok ? "✓" : "✗"}
    </Badge>
  );
}

function DnsRecords({ domain }: { domain: string }) {
  const rows = [
    {
      type: "TXT",
      host: "@",
      value: "v=spf1 include:_spf.google.com ~all",
      note: "SPF — use include:spf.protection.outlook.com for Microsoft 365, or your SMTP host's include.",
    },
    {
      type: "TXT",
      host: "_dmarc",
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; fo=1`,
      note: "DMARC — start with p=none while warming, then tighten to quarantine.",
    },
    {
      type: "TXT (CNAME for some providers)",
      host: "<selector>._domainkey",
      value: "(generated in your email provider's admin console)",
      note: "DKIM — Google: Admin console → Apps → Gmail → Authenticate email. Microsoft: Defender portal → Email authentication.",
    },
  ];
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
      <p className="font-medium">DNS records to add at your DNS host:</p>
      {rows.map((r) => (
        <div key={r.host} className="space-y-0.5">
          <div className="flex flex-wrap gap-x-4">
            <span className="font-mono font-medium">{r.type}</span>
            <span className="font-mono">host: {r.host}</span>
          </div>
          <div className="break-all font-mono text-muted-foreground">
            {r.value}
          </div>
          <p className="text-muted-foreground">{r.note}</p>
        </div>
      ))}
    </div>
  );
}

export function DomainsPanel({ domains }: { domains: DomainRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<DomainRow | null>(null);
  const { toast } = useToast();

  function run(
    id: string | null,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMessage?: string
  ) {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Something went wrong",
          description: res.error ?? "Please try again.",
        });
      } else if (successMessage) {
        toast({ variant: "success", title: successMessage });
      }
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sending domains</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {domains.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No sending domains yet — they're added automatically when you
            connect a mailbox, or add one below to see the DNS records to set
            up.
          </p>
        )}

        {domains.map((d) => (
          <div key={d.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="flex items-center gap-1 font-medium"
                onClick={() => setExpanded(expanded === d.id ? null : d.id)}
              >
                {expanded === d.id ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                {d.domain}
              </button>
              <div className="flex flex-wrap gap-1.5">
                <AuthBadge label="SPF" ok={d.spfValid} />
                <AuthBadge label="DKIM" ok={d.dkimValid} />
                <AuthBadge label="DMARC" ok={d.dmarcValid} />
                {d.blacklists.length > 0 && (
                  <Badge variant="danger">
                    {d.blacklists.length} blacklist(s)
                  </Badge>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {d.healthScore !== null && (
                  <span
                    className={`text-sm font-semibold ${
                      d.healthScore >= 80
                        ? "text-emerald-600"
                        : d.healthScore >= 50
                          ? "text-amber-600"
                          : "text-red-600"
                    }`}
                  >
                    {d.healthScore}/100
                  </span>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  title="Check now"
                  disabled={pending}
                  onClick={() =>
                    run(d.id, () => recheckSendingDomain({ domainId: d.id }))
                  }
                >
                  {pending && busyId === d.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Remove domain"
                  disabled={pending}
                  onClick={() => setConfirmRemove(d)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
            {d.lastCheckedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Last checked {new Date(d.lastCheckedAt).toLocaleString()}
              </p>
            )}
            {expanded === d.id && (
              <div className="mt-3">
                <DnsRecords domain={d.domain} />
              </div>
            )}
          </div>
        ))}

        <div className="flex gap-2">
          <Input
            placeholder="yourdomain.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            className="max-w-xs"
          />
          <Button
            variant="outline"
            disabled={pending || !newDomain.trim()}
            onClick={() =>
              run(
                null,
                async () => {
                  const res = await addSendingDomain({
                    domain: newDomain.trim(),
                  });
                  if (res.ok) setNewDomain("");
                  return res;
                },
                "Domain added"
              )
            }
          >
            {pending && busyId === null ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add domain
          </Button>
        </div>

        <ConfirmDialog
          open={confirmRemove !== null}
          onOpenChange={(open) => !open && setConfirmRemove(null)}
          title={`Stop monitoring ${confirmRemove?.domain ?? ""}?`}
          description="The domain will be removed from the health scorecard. You can add it back at any time."
          confirmLabel="Remove"
          destructive
          onConfirm={() => {
            if (confirmRemove)
              run(
                confirmRemove.id,
                () => deleteSendingDomain({ domainId: confirmRemove.id }),
                "Domain removed"
              );
          }}
        />
      </CardContent>
    </Card>
  );
}
