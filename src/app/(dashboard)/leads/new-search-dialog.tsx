"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { SENIORITIES, EMPLOYEE_RANGES } from "@/modules/apollo/reference";
import {
  aiPlanApolloSearch,
  previewApolloSearch,
  importFromApollo,
} from "./actions";

const LEAD_COUNTS = [25, 50, 100, 250, 500, 1000];

interface Plan {
  listName: string;
  filters: {
    personTitles: string[];
    seniorities: string[];
    industries: string[];
    locations: string[];
    employeeRanges: string[];
    technologies: string[];
    keywords?: string;
  };
}

interface Preview {
  totalEntries: number;
  sample: Array<{
    name: string;
    title?: string | null;
    company?: string | null;
    industry?: string | null;
    location?: string | null;
    emailStatus?: string | null;
  }>;
}

/** Human-readable summary chips of the AI-planned filters. */
function PlanSummary({ plan }: { plan: Plan }) {
  const f = plan.filters;
  const seniorityLabel = (v: string) =>
    SENIORITIES.find((s) => s.value === v)?.label ?? v;
  const rangeLabel = (v: string) =>
    EMPLOYEE_RANGES.find((r) => r.value === v)?.label ?? v;

  const groups: Array<{ label: string; values: string[] }> = [
    { label: "Titles", values: f.personTitles },
    { label: "Seniority", values: f.seniorities.map(seniorityLabel) },
    { label: "Industries", values: f.industries },
    { label: "Locations", values: f.locations },
    { label: "Headcount", values: f.employeeRanges.map(rangeLabel) },
    { label: "Tech stack", values: f.technologies },
    { label: "Keywords", values: f.keywords ? [f.keywords] : [] },
  ].filter((g) => g.values.length > 0);

  if (groups.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No specific filters recognized — the search will be very broad. Try a
        more specific prompt.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">
            {g.label}
          </span>
          {g.values.map((v) => (
            <Badge key={v} variant="secondary" className="capitalize">
              {v}
            </Badge>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * AI-first lead finder: describe the target audience in plain English, pick
 * how many leads you want, and the AI plans the Apollo filters, shows the
 * matches, and imports on confirm. Preview is free; importing enriches +
 * verifies emails (spends credits).
 */
export function NewSearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const [prompt, setPrompt] = useState("");
  const [limit, setLimit] = useState(100);
  const [listName, setListName] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  function reset() {
    setPlan(null);
    setPreview(null);
    setListName("");
  }

  function runFind() {
    if (prompt.trim().length < 10) {
      toast({
        variant: "destructive",
        title: "Describe your audience",
        description:
          "Tell the AI who you're targeting, e.g. \"owners of small trucking companies in Texas\".",
      });
      return;
    }
    startTransition(async () => {
      const planned = await aiPlanApolloSearch({ prompt: prompt.trim() });
      if (!planned.ok) {
        toast({
          variant: "destructive",
          title: "AI planning failed",
          description: planned.error,
        });
        return;
      }
      const previewed = await previewApolloSearch({
        listName: planned.data.listName,
        ...planned.data.filters,
        perPage: 25,
        page: 1,
      });
      if (!previewed.ok) {
        toast({
          variant: "destructive",
          title: "Search failed",
          description: previewed.error,
        });
        return;
      }
      setPlan(planned.data);
      setListName(planned.data.listName);
      setPreview({
        totalEntries: previewed.data.totalEntries,
        sample: previewed.data.sample,
      });
    });
  }

  function runImport() {
    if (!plan) return;
    if (!listName.trim()) {
      toast({
        variant: "destructive",
        title: "List name required",
        description: "Give the list a name before importing.",
      });
      return;
    }
    startTransition(async () => {
      const res = await importFromApollo({
        listName: listName.trim(),
        filters: { ...plan.filters, perPage: 25, page: 1 },
        limit,
        verify: true,
        dedupe: true,
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Import failed",
          description: res.error,
        });
        return;
      }
      toast({
        variant: "success",
        title: "Leads imported",
        description: `Imported ${res.data.imported} leads (${res.data.skippedDuplicates} duplicates skipped, ${res.data.invalid} invalid).`,
      });
      setOpen(false);
      reset();
      setPrompt("");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Sparkles className="h-4 w-4" />
          Find leads with AI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Find leads with AI</DialogTitle>
          <DialogDescription>
            Describe who you&apos;re targeting — the AI builds the search,
            shows you who matches, and imports only when you confirm.
            Previewing is free; importing enriches + verifies emails (spends
            credits).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Who are you targeting?</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder='e.g. "Owners and founders of small trucking and logistics companies in Texas, 1–20 employees"'
            />
            <p className="text-xs text-muted-foreground">
              Mention roles, industry, location, and company size — anything
              you leave out stays broad.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>How many leads do you need?</Label>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setLimit(n)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    limit === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {n.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {plan && preview && (
            <>
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">
                  How the AI interpreted your prompt
                </p>
                <PlanSummary plan={plan} />
              </div>

              <div className="space-y-1">
                <Label>List name</Label>
                <Input
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                />
              </div>

              <div className="rounded-md border p-3 text-sm">
                <p className="mb-2 font-medium">
                  ~{preview.totalEntries.toLocaleString()} matches. Sample:
                </p>
                {preview.sample.length === 0 ? (
                  <p className="text-muted-foreground">
                    No matches — try rephrasing the prompt with broader terms.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {preview.sample.slice(0, 8).map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="truncate font-medium">
                            {p.name || "(name hidden until import)"}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            — {p.title} @ {p.company}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            {[p.industry, p.location]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        {p.emailStatus === "verified" && (
                          <Badge variant="success">verified</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant={plan ? "outline" : "default"}
            onClick={runFind}
            disabled={pending}
          >
            {pending && !plan ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {plan ? "Rerun with edited prompt" : "Find leads"}
          </Button>
          {plan && preview && (
            <Button onClick={runImport} disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Enrich &amp; import {limit.toLocaleString()}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
