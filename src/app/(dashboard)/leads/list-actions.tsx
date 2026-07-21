"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Trash2 } from "lucide-react";
import { deleteList } from "./actions";

export function DeleteListButton({
  listId,
  listName,
  leadCount,
}: {
  listId: string;
  listName: string;
  leadCount: number;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function remove() {
    startTransition(async () => {
      const res = await deleteList({ listId });
      if (res.ok) {
        toast({
          variant: "success",
          title: "List deleted",
          description: `"${listName}" removed.`,
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
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
        title={`Delete list ${listName}`}
        disabled={pending}
        onClick={(e) => {
          e.preventDefault();
          setConfirmOpen(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete list "${listName}"?`}
        description={`The list will be removed; its ${leadCount} lead(s) are kept and remain under "All leads".`}
        confirmLabel="Delete list"
        destructive
        onConfirm={remove}
      />
    </>
  );
}
