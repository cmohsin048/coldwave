"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, Loader2, Rocket, Sparkles } from "lucide-react";
import { describeActionError } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { createCampaignWithEmail, generateEmailCopy } from "../actions";

const NO_LIST = "none";

export function NewCampaignForm({
  lists,
}: {
  lists: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [creating, startCreate] = useTransition();
  const [generating, startGenerate] = useTransition();

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [listId, setListId] = useState<string>(NO_LIST);

  const [aiOpen, setAiOpen] = useState(false);
  const [brief, setBrief] = useState({
    icp: "",
    product: "",
    tone: "friendly, direct",
    offer: "",
    goal: "book a 15-minute demo",
  });

  const setBriefField =
    (k: keyof typeof brief) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setBrief((b) => ({ ...b, [k]: e.target.value }));

  function generate() {
    startGenerate(async () => {
      const res = await generateEmailCopy(brief);
      if (res.ok) {
        setSubject(res.data.subject);
        setBody(res.data.body);
        toast({
          variant: "success",
          title: "Email generated",
          description: "Review and edit the copy below before creating.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Generation failed",
          description: describeActionError(res),
        });
      }
    });
  }

  function create() {
    startCreate(async () => {
      const res = await createCampaignWithEmail({
        name,
        subject,
        body,
        listId: listId === NO_LIST ? undefined : listId,
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Create failed",
          description: describeActionError(res),
        });
        return;
      }
      toast({
        variant: "success",
        title: "Campaign created",
        description:
          res.data.enrolled !== null
            ? `Enrolled ${res.data.enrolled} leads. Opening the builder…`
            : res.data.enrollError
              ? `Campaign saved, but enrollment failed: ${res.data.enrollError}`
              : "Opening the builder…",
      });
      router.push(`/campaigns/${res.data.campaignId}`);
    });
  }

  const canCreate = name.trim() && subject.trim() && body.trim();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Campaign</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <Label>Campaign name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q3 outbound — SaaS founders"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>First email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Quick question, {{firstName}}"
              />
            </div>
            <div className="space-y-1">
              <Label>Body</Label>
              <Textarea
                rows={10}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  "Hi {{firstName}},\n\nUse {{firstName}}-style merge fields and {a|b} spintax for variation."
                }
              />
            </div>

            <div className="rounded-lg border bg-muted/30">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
                onClick={() => setAiOpen((v) => !v)}
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Write it with AI
                </span>
                {aiOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {aiOpen && (
                <div className="space-y-3 border-t px-4 py-3">
                  <div className="space-y-1">
                    <Label>Who are you targeting? (ICP)</Label>
                    <Textarea
                      rows={2}
                      value={brief.icp}
                      onChange={setBriefField("icp")}
                      placeholder="Heads of Sales at 20-200 person B2B SaaS in North America"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>What are you selling?</Label>
                    <Textarea
                      rows={2}
                      value={brief.product}
                      onChange={setBriefField("product")}
                      placeholder="ColdWave — deliverability-first cold email platform"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Tone</Label>
                      <Input value={brief.tone} onChange={setBriefField("tone")} />
                    </div>
                    <div className="space-y-1">
                      <Label>Offer</Label>
                      <Input
                        value={brief.offer}
                        onChange={setBriefField("offer")}
                        placeholder="Free deliverability audit"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Goal</Label>
                      <Input value={brief.goal} onChange={setBriefField("goal")} />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={generate}
                    disabled={generating || !brief.icp || !brief.product}
                  >
                    {generating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Generate email
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    The generated copy lands in the subject and body fields above
                    — edit it as much as you like before creating.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Recipients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Lead list</Label>
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a list" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LIST}>Don&apos;t enroll yet</SelectItem>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {lists.length === 0
                ? "No lead lists yet — import or search for leads first, then enroll them from the campaign page."
                : "Suppressed, unsubscribed, and bounced leads are skipped automatically. You can enroll more lists later."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <Button
              className="w-full"
              onClick={create}
              disabled={creating || !canCreate}
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              Create campaign
            </Button>
            <p className="text-xs text-muted-foreground">
              The campaign is created as a draft — nothing sends until you hit
              Launch. After creating you land in the visual builder to add
              follow-up steps, A/B variants, and branches.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
