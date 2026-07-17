"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";
import { generateCampaign } from "../campaigns/actions";

export function DesignerForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    icp: "",
    product: "",
    tone: "friendly, direct",
    offer: "",
    goal: "book a 15-minute demo",
    numSteps: 4,
  });

  const set =
    (k: keyof typeof form) =>
    (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await generateCampaign({
        ...form,
        numSteps: Number(form.numSteps),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/campaigns/${res.data.campaignId}`);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Campaign brief</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Campaign name</Label>
            <Input value={form.name} onChange={set("name")} />
          </div>
          <div className="space-y-1">
            <Label>Ideal customer profile (ICP)</Label>
            <Textarea
              rows={2}
              value={form.icp}
              onChange={set("icp")}
              placeholder="Heads of Sales at 20-200 person B2B SaaS in North America"
            />
          </div>
          <div className="space-y-1">
            <Label>Product description</Label>
            <Textarea
              rows={2}
              value={form.product}
              onChange={set("product")}
              placeholder="ColdWave — deliverability-first cold email platform"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tone</Label>
              <Input value={form.tone} onChange={set("tone")} />
            </div>
            <div className="space-y-1">
              <Label># of steps</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={form.numSteps}
                onChange={set("numSteps")}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Offer</Label>
            <Input
              value={form.offer}
              onChange={set("offer")}
              placeholder="Free deliverability audit"
            />
          </div>
          <div className="space-y-1">
            <Label>Goal</Label>
            <Input value={form.goal} onChange={set("goal")} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={submit} disabled={pending} className="w-full">
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate sequence
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            The designer calls OpenAI with a strict JSON schema, so every result
            is a valid sequence — subject lines, body copy with spintax and
            merge fields, per-step delays, A/B variants, and branch conditions.
          </p>
          <p>
            On generate, a draft campaign is created and opened in the visual
            builder where you can fine-tune every step and its branches.
          </p>
          <p>
            Bodies use {"{{firstName}}"}-style merge fields and {"{a|b}"}{" "}
            spintax so each recipient gets a slightly different message —
            better for deliverability.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
