"use client";

import { useRef, useState, useTransition } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { SENIORITIES, EMPLOYEE_RANGES } from "@/modules/apollo/reference";
import {
  previewApolloSearch,
  importFromApollo,
  searchIndustries,
} from "./actions";

/** Parse a comma-separated field into a trimmed array. */
function toList(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Small toggle chip used for seniority + headcount pickers. */
function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

export function NewSearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const [listName, setListName] = useState("");
  const [personTitles, setPersonTitles] = useState("");
  const [locations, setLocations] = useState("");
  const [technologies, setTechnologies] = useState("");
  const [keywords, setKeywords] = useState("");
  const [seniorities, setSeniorities] = useState<Set<string>>(new Set());
  const [employeeRanges, setEmployeeRanges] = useState<Set<string>>(new Set());

  // Industry typeahead state: selected chips + live suggestions.
  const [industries, setIndustries] = useState<string[]>([]);
  const [industryQuery, setIndustryQuery] = useState("");
  const [industrySuggestions, setIndustrySuggestions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [industryLoading, setIndustryLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [limit, setLimit] = useState(100);
  const [verify, setVerify] = useState(true);
  const [dedupe, setDedupe] = useState(true);

  const [preview, setPreview] = useState<{
    totalEntries: number;
    sample: Array<{
      name: string;
      title?: string | null;
      company?: string | null;
      industry?: string | null;
      location?: string | null;
      emailStatus?: string | null;
    }>;
  } | null>(null);

  function onIndustryQueryChange(v: string) {
    setIndustryQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) {
      setIndustrySuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIndustryLoading(true);
      const res = await searchIndustries({ q: v.trim() });
      setIndustryLoading(false);
      if (res.ok) setIndustrySuggestions(res.data.industries);
    }, 300);
  }

  function addIndustry(name: string) {
    const clean = name.trim().toLowerCase();
    if (!clean) return;
    setIndustries((prev) =>
      prev.includes(clean) ? prev : [...prev, clean]
    );
    setIndustryQuery("");
    setIndustrySuggestions([]);
  }

  function toggle(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const filters = () => ({
    personTitles: toList(personTitles),
    seniorities: [...seniorities],
    industries,
    locations: toList(locations),
    employeeRanges: [...employeeRanges],
    technologies: toList(technologies),
    keywords: keywords || undefined,
    perPage: 25,
    page: 1,
  });

  function runPreview() {
    startTransition(async () => {
      const res = await previewApolloSearch({
        listName: listName || "preview",
        ...filters(),
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Preview failed",
          description: res.error,
        });
        return;
      }
      setPreview({
        totalEntries: res.data.totalEntries,
        sample: res.data.sample,
      });
    });
  }

  function runImport() {
    if (!listName) {
      toast({
        variant: "destructive",
        title: "List name required",
        description: "Give the list a name before importing.",
      });
      return;
    }
    startTransition(async () => {
      const res = await importFromApollo({
        listName,
        filters: filters(),
        limit,
        verify,
        dedupe,
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
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Search className="h-4 w-4" />
          New Apollo search
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Find leads with Apollo</DialogTitle>
          <DialogDescription>
            Preview is free and shows a sample — always preview before
            importing. Importing enriches + verifies emails (spends credits).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>List name</Label>
            <Input
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="Dental practice owners — US"
            />
          </div>

          <div className="space-y-1">
            <Label>Job titles</Label>
            <Input
              value={personTitles}
              onChange={(e) => setPersonTitles(e.target.value)}
              placeholder="owner, dentist, practice manager"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated. Matches the person&apos;s current title —
              this is usually your strongest filter.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Seniority</Label>
            <div className="flex flex-wrap gap-1.5">
              {SENIORITIES.map((s) => (
                <ToggleChip
                  key={s.value}
                  label={s.label}
                  active={seniorities.has(s.value)}
                  onClick={() =>
                    setSeniorities((prev) => toggle(prev, s.value))
                  }
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Industries</Label>
            {industries.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {industries.map((name) => (
                  <Badge key={name} variant="secondary" className="gap-1 pr-1">
                    <span className="capitalize">{name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setIndustries((prev) => prev.filter((i) => i !== name))
                      }
                      className="rounded-full p-0.5 hover:bg-background/60"
                      aria-label={`Remove ${name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="relative">
              <Input
                value={industryQuery}
                onChange={(e) => onIndustryQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addIndustry(industrySuggestions[0]?.name ?? industryQuery);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setIndustrySuggestions([]);
                  }
                }}
                onBlur={() => {
                  // Delay so a click on a suggestion still registers first.
                  setTimeout(() => setIndustrySuggestions([]), 150);
                }}
                placeholder="Type to search industries… (e.g. medical, software)"
              />
              {industryLoading && (
                <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {industrySuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
                  {industrySuggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="block w-full rounded-sm px-2 py-1.5 text-left text-sm capitalize hover:bg-accent"
                      // onMouseDown fires before the input's blur, so the
                      // selection always lands even as the list dismisses.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addIndustry(s.name);
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Pick from Apollo&apos;s taxonomy for exact matching. Niches that
              aren&apos;t listed (e.g. &quot;dental clinic&quot;) — put them in
              Keywords instead.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Locations</Label>
              <Input
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                placeholder="United States, California, London"
              />
              <p className="text-xs text-muted-foreground">
                Country, state/region, or city — comma-separated.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Tech stack (used by their company)</Label>
              <Input
                value={technologies}
                onChange={(e) => setTechnologies(e.target.value)}
                placeholder="salesforce, hubspot, shopify"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Company headcount</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMPLOYEE_RANGES.map((r) => (
                <ToggleChip
                  key={r.value}
                  label={r.label}
                  active={employeeRanges.has(r.value)}
                  onClick={() =>
                    setEmployeeRanges((prev) => toggle(prev, r.value))
                  }
                />
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Keywords</Label>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="dental clinic, orthodontics"
            />
            <p className="text-xs text-muted-foreground">
              Free-text match on names, titles, and companies — best place for
              niche terms that aren&apos;t an industry or title.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="limit">Import limit</Label>
            <Input
              id="limit"
              type="number"
              className="w-24"
              value={limit}
              min={1}
              max={2000}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="verify" checked={verify} onCheckedChange={setVerify} />
            <Label htmlFor="verify">Verify emails</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="dedupe" checked={dedupe} onCheckedChange={setDedupe} />
            <Label htmlFor="dedupe">Dedupe already-contacted</Label>
          </div>
        </div>

        {preview && (
          <div className="rounded-md border p-3 text-sm">
            <p className="mb-2 font-medium">
              ~{preview.totalEntries.toLocaleString()} matches. Sample:
            </p>
            <div className="space-y-1.5">
              {preview.sample.slice(0, 8).map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="truncate font-medium">
                      {p.name || "(name hidden until import)"}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {p.title} @ {p.company}
                    </span>
                    <div className="text-xs text-muted-foreground">
                      {[p.industry, p.location].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {p.emailStatus === "verified" && (
                    <Badge variant="success">verified</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={runPreview} disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Preview
          </Button>
          <Button onClick={runImport} disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Enrich &amp; import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
