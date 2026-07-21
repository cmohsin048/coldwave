"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Trash2, FolderInput } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { deleteLeads, moveLeads } from "./actions";

const verificationVariant: Record<
  string,
  "success" | "warning" | "danger" | "secondary"
> = {
  valid: "success",
  verified: "success",
  risky: "warning",
  catch_all: "warning",
  invalid: "danger",
  disposable: "danger",
  unknown: "secondary",
};

interface LeadRow {
  id: string;
  name: string;
  title: string | null;
  companyName: string | null;
  industry: string | null;
  email: string;
  verification: string;
}

export function LeadsTable({
  rows,
  lists,
}: {
  rows: LeadRow[];
  lists: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulkDelete() {
    const count = selected.size;
    startTransition(async () => {
      const res = await deleteLeads({ leadIds: [...selected] });
      if (res.ok) {
        setSelected(new Set());
        toast({
          variant: "success",
          title: "Leads deleted",
          description: `${count} lead(s) removed.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Delete failed",
          description: res.error,
        });
      }
    });
  }

  function bulkMove() {
    if (!moveTarget) return;
    startTransition(async () => {
      const res = await moveLeads({ leadIds: [...selected], listId: moveTarget });
      if (res.ok) {
        setSelected(new Set());
        toast({
          variant: "success",
          title: "Leads moved",
          description: `${res.data.moved} lead(s) moved to the selected list.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Move failed",
          description: res.error,
        });
      }
    });
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-2">
            {lists.length > 0 && (
              <>
                <Select value={moveTarget} onValueChange={setMoveTarget}>
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue placeholder="Move to list…" />
                  </SelectTrigger>
                  <SelectContent>
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={bulkMove}
                  disabled={pending || !moveTarget}
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FolderInput className="h-4 w-4" />
                  )}
                  Move
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${selected.size} lead(s)?`}
        description="The selected leads will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={bulkDelete}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 accent-primary"
                aria-label="Select all leads"
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((lead) => (
            <TableRow key={lead.id} data-state={selected.has(lead.id) ? "selected" : undefined}>
              <TableCell>
                <input
                  type="checkbox"
                  checked={selected.has(lead.id)}
                  onChange={() => toggle(lead.id)}
                  className="h-4 w-4 accent-primary"
                  aria-label={`Select ${lead.email}`}
                />
              </TableCell>
              <TableCell className="font-medium">{lead.name}</TableCell>
              <TableCell className="text-muted-foreground">{lead.title}</TableCell>
              <TableCell>{lead.companyName}</TableCell>
              <TableCell className="text-muted-foreground capitalize">
                {lead.industry ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">{lead.email}</TableCell>
              <TableCell>
                <Badge variant={verificationVariant[lead.verification] ?? "secondary"}>
                  {lead.verification}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
