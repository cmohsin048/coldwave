"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Check, ChevronsUpDown, Trash2 } from "lucide-react";
import { deleteList } from "./actions";

interface ListInfo {
  id: string;
  name: string;
  leadCount: number;
}

/**
 * List picker shown above the leads table. Each list row carries its own
 * delete button; switching navigates via the ?list param.
 */
export function ListSwitcher({
  lists,
  activeListId,
}: {
  lists: ListInfo[];
  activeListId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ListInfo | null>(null);
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  const active = lists.find((l) => l.id === activeListId);

  function go(listId?: string) {
    setOpen(false);
    router.push(listId ? `/leads?list=${listId}` : "/leads");
  }

  function removeList(target: ListInfo) {
    startTransition(async () => {
      const res = await deleteList({ listId: target.id });
      if (res.ok) {
        toast({
          variant: "success",
          title: "List deleted",
          description: `"${target.name}" removed — its leads remain under All leads.`,
        });
        router.push("/leads");
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Delete failed",
          description: res.error,
        });
      }
    });
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-80 justify-between font-normal"
          >
            <span className="truncate">
              {active ? `${active.name} (${active.leadCount})` : "All leads"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-1">
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent"
            onClick={() => go()}
          >
            <Check
              className={`h-4 w-4 shrink-0 ${!active ? "opacity-100" : "opacity-0"}`}
            />
            <span className="font-medium">All leads</span>
          </button>
          {lists.length > 0 && <div className="my-1 border-t" />}
          {lists.map((l) => (
            <div
              key={l.id}
              className="flex items-center rounded-sm hover:bg-accent"
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                onClick={() => go(l.id)}
              >
                <Check
                  className={`h-4 w-4 shrink-0 ${active?.id === l.id ? "opacity-100" : "opacity-0"}`}
                />
                <span className="truncate">{l.name}</span>
                <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
                  {l.leadCount}
                </span>
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="mr-1 h-7 w-7 shrink-0"
                title={`Delete list ${l.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  setConfirmTarget(l);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </PopoverContent>
      </Popover>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
        title={`Delete list "${confirmTarget?.name ?? ""}"?`}
        description={`The list will be removed; its ${confirmTarget?.leadCount ?? 0} lead(s) are kept and remain under "All leads".`}
        confirmLabel="Delete list"
        destructive
        onConfirm={() => {
          if (confirmTarget) removeList(confirmTarget);
        }}
      />
    </>
  );
}
