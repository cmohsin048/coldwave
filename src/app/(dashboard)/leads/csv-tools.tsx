"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
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
import { Upload, Download, Loader2 } from "lucide-react";
import { importCsv, exportLeadsCsv } from "./actions";

export function CsvImportButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [listName, setListName] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setRows(res.data);
        setMessage(`${res.data.length} rows parsed.`);
      },
    });
  }

  function submit() {
    if (!listName || rows.length === 0) {
      setMessage("Pick a file and name the list.");
      return;
    }
    startTransition(async () => {
      const res = await importCsv({
        listName,
        rows,
        dedupe: true,
        verify: false,
      });
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      setMessage(
        `Imported ${res.data.imported} (${res.data.skippedDuplicates} duplicates).`
      );
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
          <DialogDescription>
            Columns like email, first name, last name, title, company, domain
            are auto-detected.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>List name</Label>
            <Input
              value={listName}
              onChange={(e) => setListName(e.target.value)}
            />
          </div>
          <Input ref={fileRef} type="file" accept=".csv" onChange={onFile} />
          {message && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExportCsvButton({ listId }: { listId?: string }) {
  const [pending, startTransition] = useTransition();

  function download() {
    startTransition(async () => {
      const res = await exportLeadsCsv({ listId });
      if (!res.ok) return;
      const blob = new Blob([res.data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `coldwave-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <Button variant="outline" onClick={download} disabled={pending}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Export CSV
    </Button>
  );
}
