"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";
import { describeActionError } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { generateEmailCopy, generateStepsForCampaign } from "../actions";

export interface AiBrief {
  icp: string;
  product: string;
  tone: string;
  offer: string;
  goal: string;
}

const EMPTY_BRIEF: AiBrief = {
  icp: "",
  product: "",
  tone: "friendly, direct",
  offer: "",
  goal: "book a 15-minute demo",
};

/**
 * AI generation dialog for the campaign canvas.
 *
 * mode "sequence": generates a full multi-step sequence and appends it to the
 * campaign (the page refreshes to show the new nodes).
 * mode "step": generates copy for a single email and hands it to `onEmail`
 * so the caller can fill the selected step's subject/body.
 */
export function AiDialog({
  mode,
  campaignId,
  initialBrief,
  onEmail,
  trigger,
}: {
  mode: "sequence" | "step";
  campaignId: string;
  initialBrief?: Partial<AiBrief> | null;
  onEmail?: (email: { subject: string; body: string }) => void;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [numSteps, setNumSteps] = useState(4);
  const [brief, setBrief] = useState<AiBrief>({
    ...EMPTY_BRIEF,
    ...Object.fromEntries(
      Object.entries(initialBrief ?? {}).filter(
        ([, v]) => typeof v === "string" && v
      )
    ),
  });

  const set =
    (k: keyof AiBrief) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setBrief((b) => ({ ...b, [k]: e.target.value }));

  function generate() {
    startTransition(async () => {
      if (mode === "step") {
        const res = await generateEmailCopy(brief);
        if (res.ok) {
          onEmail?.(res.data);
          toast({
            variant: "success",
            title: "Email written",
            description: "The step's subject and body were filled in — edit away.",
          });
          setOpen(false);
        } else {
          toast({
            variant: "destructive",
            title: "Generation failed",
            description: describeActionError(res),
          });
        }
        return;
      }

      const res = await generateStepsForCampaign({
        campaignId,
        ...brief,
        numSteps: Number(numSteps) || 4,
      });
      if (res.ok) {
        toast({
          variant: "success",
          title: `${res.data.added} steps generated`,
          description: res.data.strategy,
        });
        setOpen(false);
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Generation failed",
          description: describeActionError(res),
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {mode === "sequence"
              ? "Generate sequence with AI"
              : "Write this email with AI"}
          </DialogTitle>
          <DialogDescription>
            {mode === "sequence"
              ? "New steps are added below what's already on the canvas. Save any unsaved edits first — the canvas reloads after generating."
              : "Fills the selected step's subject and body. You can edit the result before saving."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Who are you targeting? (ICP)</Label>
            <Textarea
              rows={2}
              value={brief.icp}
              onChange={set("icp")}
              placeholder="Heads of Sales at 20-200 person B2B SaaS in North America"
            />
          </div>
          <div className="space-y-1">
            <Label>What are you selling?</Label>
            <Textarea
              rows={2}
              value={brief.product}
              onChange={set("product")}
              placeholder="ColdWave — deliverability-first cold email platform"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tone</Label>
              <Input value={brief.tone} onChange={set("tone")} />
            </div>
            {mode === "sequence" ? (
              <div className="space-y-1">
                <Label># of steps</Label>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={numSteps}
                  onChange={(e) => setNumSteps(Number(e.target.value))}
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Goal</Label>
                <Input value={brief.goal} onChange={set("goal")} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Offer (optional)</Label>
              <Input
                value={brief.offer}
                onChange={set("offer")}
                placeholder="Free deliverability audit"
              />
            </div>
            {mode === "sequence" && (
              <div className="space-y-1">
                <Label>Goal</Label>
                <Input value={brief.goal} onChange={set("goal")} />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={generate}
            disabled={pending || brief.icp.trim().length < 3 || brief.product.trim().length < 3}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {mode === "sequence" ? "Generate sequence" : "Write email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
