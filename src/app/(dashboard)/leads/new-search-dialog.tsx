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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Sparkles } from "lucide-react";
import { previewApolloSearch, importFromApollo } from "./actions";

/** Parse a comma-separated field into a trimmed array. */
function toList(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function NewSearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    listName: "",
    personTitles: "",
    seniorities: "",
    industries: "",
    locations: "",
    employeeRanges: "",
    technologies: "",
    keywords: "",
  });
  const [limit, setLimit] = useState(100);
  const [verify, setVerify] = useState(true);
  const [dedupe, setDedupe] = useState(true);

  const [preview, setPreview] = useState<{
    totalEntries: number;
    sample: Array<{
      name: string;
      title?: string;
      company?: string;
      emailStatus?: string;
    }>;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filters = () => ({
    personTitles: toList(form.personTitles),
    seniorities: toList(form.seniorities),
    industries: toList(form.industries),
    locations: toList(form.locations),
    employeeRanges: toList(form.employeeRanges),
    technologies: toList(form.technologies),
    keywords: form.keywords || undefined,
    perPage: 25,
    page: 1,
  });

  function runPreview() {
    setMessage(null);
    startTransition(async () => {
      const res = await previewApolloSearch({
        listName: form.listName || "preview",
        ...filters(),
      });
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      setPreview({ totalEntries: res.data.totalEntries, sample: res.data.sample });
    });
  }

  function runImport() {
    setMessage(null);
    if (!form.listName) {
      setMessage("Give the list a name first.");
      return;
    }
    startTransition(async () => {
      const res = await importFromApollo({
        listName: form.listName,
        filters: filters(),
        limit,
        verify,
        dedupe,
      });
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      setMessage(
        `Imported ${res.data.imported} leads (${res.data.skippedDuplicates} duplicates skipped, ${res.data.invalid} invalid).`
      );
      router.refresh();
    });
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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
            Filter by title, seniority, industry, headcount, location, and tech
            stack. Preview is free; importing enriches + verifies emails.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>List name</Label>
            <Input
              value={form.listName}
              onChange={set("listName")}
              placeholder="Q3 SaaS founders"
            />
          </div>
          <div className="space-y-1">
            <Label>Job titles</Label>
            <Input
              value={form.personTitles}
              onChange={set("personTitles")}
              placeholder="CEO, Head of Sales"
            />
          </div>
          <div className="space-y-1">
            <Label>Seniorities</Label>
            <Input
              value={form.seniorities}
              onChange={set("seniorities")}
              placeholder="founder, c_suite, vp"
            />
          </div>
          <div className="space-y-1">
            <Label>Industries</Label>
            <Input
              value={form.industries}
              onChange={set("industries")}
              placeholder="computer software, marketing"
            />
          </div>
          <div className="space-y-1">
            <Label>Locations</Label>
            <Input
              value={form.locations}
              onChange={set("locations")}
              placeholder="United States, London"
            />
          </div>
          <div className="space-y-1">
            <Label>Headcount ranges</Label>
            <Input
              value={form.employeeRanges}
              onChange={set("employeeRanges")}
              placeholder="1,10 / 11,50 (comma per range)"
            />
          </div>
          <div className="space-y-1">
            <Label>Tech stack</Label>
            <Input
              value={form.technologies}
              onChange={set("technologies")}
              placeholder="salesforce, hubspot"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Keywords</Label>
            <Input
              value={form.keywords}
              onChange={set("keywords")}
              placeholder="Optional free text"
            />
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
            <div className="space-y-1">
              {preview.sample.slice(0, 8).map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {p.name} — {p.title} @ {p.company}
                  </span>
                  {p.emailStatus === "verified" && (
                    <Badge variant="success">verified</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
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
