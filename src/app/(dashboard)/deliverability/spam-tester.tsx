"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SpamGauge } from "@/components/spam-gauge";
import { Loader2, ShieldCheck, ScanLine } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { checkSpam, checkDomainHealth } from "./actions";

type SpamResult = Awaited<ReturnType<typeof checkSpam>>;
type DomainResult = Awaited<ReturnType<typeof checkDomainHealth>>;

export function SpamTester() {
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState("Quick question about {{companyName}}");
  const [body, setBody] = useState(
    "Hi {{firstName}},\n\nNoticed your team is scaling outbound. Worth a quick chat?\n\nBest,\nAlex"
  );
  const [domain, setDomain] = useState("");
  const [ip, setIp] = useState("");
  const [result, setResult] = useState<SpamResult | null>(null);
  const [domainResult, setDomainResult] = useState<DomainResult | null>(null);
  const { toast } = useToast();

  function runSpam() {
    startTransition(async () => {
      const res = await checkSpam({
        subject,
        body,
        domain: domain || undefined,
        sendingIp: ip || undefined,
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Spam check failed",
          description: res.error,
        });
      }
      setResult(res);
    });
  }

  function runDomain() {
    if (!domain) return;
    startTransition(async () => {
      const res = await checkDomainHealth({
        domain,
        sendingIp: ip || undefined,
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Domain check failed",
          description: res.error,
        });
      }
      setDomainResult(res);
    });
  }

  const spam = result?.ok ? result.data : null;
  const health = domainResult?.ok ? domainResult.data : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Pre-send spam check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Body</Label>
            <Textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Sending domain (optional)</Label>
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="yourdomain.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Sending IP (optional)</Label>
              <Input
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="1.2.3.4"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={runSpam} disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanLine className="h-4 w-4" />
              )}
              Check spam score
            </Button>
            <Button variant="outline" onClick={runDomain} disabled={pending || !domain}>
              <ShieldCheck className="h-4 w-4" />
              Check domain
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {spam && (
          <Card>
            <CardHeader>
              <CardTitle>Spam score</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SpamGauge score={spam.score} />
              <div>
                <p className="mb-1 text-sm font-medium">Suggestions</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {spam.suggestions.map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              </div>
              {spam.breakdown.triggerWords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {spam.breakdown.triggerWords.map((t) => (
                    <Badge key={t.term} variant="warning">
                      {t.term} ×{t.count}
                    </Badge>
                  ))}
                </div>
              )}
              {!spam.passed && (
                <p className="text-sm font-medium text-destructive">
                  Above the block threshold — sending would be blocked.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {health && (
          <Card>
            <CardHeader>
              <CardTitle>Domain health · {domain}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-2xl font-bold">{health.healthScore}/100</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <AuthRow label="SPF" ok={health.dns.spf.present} />
                <AuthRow label="DKIM" ok={health.dns.dkim.present} />
                <AuthRow label="DMARC" ok={health.dns.dmarc.present} />
                <AuthRow
                  label="rDNS"
                  ok={health.dns.rdns.valid || !ip}
                />
              </div>
              {health.blacklists.length > 0 ? (
                <p className="text-sm text-destructive">
                  Blacklisted on: {health.blacklists.join(", ")}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not on any checked blacklist.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function AuthRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded border px-2 py-1">
      <span>{label}</span>
      <Badge variant={ok ? "success" : "danger"}>{ok ? "Pass" : "Fail"}</Badge>
    </div>
  );
}
