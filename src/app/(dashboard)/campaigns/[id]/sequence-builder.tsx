"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
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
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Save, Trash2, Trophy, FlaskConical } from "lucide-react";
import { countVariants } from "@/modules/spintax";
import {
  saveSteps,
  addStepVariant,
  updateStepVariant,
  deleteStepVariant,
} from "../actions";

interface VariantData {
  id: string;
  label: string;
  subject: string;
  body: string;
  weight: number;
  isWinner: boolean;
  sent: number;
  opens: number;
  clicks: number;
  replies: number;
}

interface StepData {
  id: string;
  type: "email" | "wait" | "condition";
  stage: "awareness" | "interest" | "demo" | "close";
  order: number;
  subject: string;
  body: string;
  delayDays: number;
  delayHours: number;
  nextIfReplied?: string | null;
  nextIfOpened?: string | null;
  nextIfNoOpen?: string | null;
  position: { x: number; y: number };
  variants: VariantData[];
}

const stageColor: Record<string, string> = {
  awareness: "#3b82f6",
  interest: "#8b5cf6",
  demo: "#f59e0b",
  close: "#22c55e",
};

/** Branch labels cycle on edge click: no open → opened → replied. */
const BRANCH_CYCLE = ["no open", "opened", "replied"] as const;

function nodeStyle(stage: string) {
  return {
    borderLeft: `4px solid ${stageColor[stage]}`,
    borderRadius: 8,
    padding: 8,
    width: 220,
    fontSize: 12,
    background: "hsl(var(--card))",
    color: "hsl(var(--card-foreground))",
  };
}

let tempCounter = 0;

export function SequenceBuilder({
  campaignId,
  initialSteps,
}: {
  campaignId: string;
  initialSteps: StepData[];
}) {
  const router = useRouter();
  const [steps, setSteps] = useState<Record<string, StepData>>(() =>
    Object.fromEntries(initialSteps.map((s) => [s.id, s]))
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSteps[0]?.id ?? null
  );
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState(false);
  const [pending, startTransition] = useTransition();
  const [variantPending, startVariantTransition] = useTransition();
  const { toast } = useToast();

  // Local edit buffers for A/B variants (variantId → draft).
  const [variantDrafts, setVariantDrafts] = useState<
    Record<string, { subject: string; body: string }>
  >({});

  const initialNodes: Node[] = useMemo(
    () =>
      initialSteps.map((s) => ({
        id: s.id,
        position: s.position,
        data: { label: s.subject || "(no subject)" },
        style: nodeStyle(s.stage),
      })),
    [initialSteps]
  );

  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    for (const s of initialSteps) {
      if (s.nextIfNoOpen)
        edges.push({
          id: `${s.id}-no`,
          source: s.id,
          target: s.nextIfNoOpen,
          label: "no open",
          markerEnd: { type: MarkerType.ArrowClosed },
        });
      if (s.nextIfReplied)
        edges.push({
          id: `${s.id}-re`,
          source: s.id,
          target: s.nextIfReplied,
          label: "replied",
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
        });
      if (s.nextIfOpened)
        edges.push({
          id: `${s.id}-op`,
          source: s.id,
          target: s.nextIfOpened,
          label: "opened",
          markerEnd: { type: MarkerType.ArrowClosed },
        });
    }
    return edges;
  }, [initialSteps]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) =>
        addEdge(
          { ...c, label: "no open", markerEnd: { type: MarkerType.ArrowClosed } },
          eds
        )
      ),
    [setEdges]
  );

  // Clicking an edge cycles its branch condition (no open → opened → replied).
  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== edge.id) return e;
          const idx = BRANCH_CYCLE.indexOf(
            (e.label as (typeof BRANCH_CYCLE)[number]) ?? "no open"
          );
          const next = BRANCH_CYCLE[(idx + 1) % BRANCH_CYCLE.length]!;
          return { ...e, label: next, animated: next === "replied" };
        })
      );
    },
    [setEdges]
  );

  // Keep the steps record + deleted list in sync when nodes are removed
  // (Backspace/Delete in the canvas).
  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const ids = deleted.map((n) => n.id);
      setSteps((s) => {
        const next = { ...s };
        for (const id of ids) delete next[id];
        return next;
      });
      setDeletedIds((prev) => [
        ...prev,
        ...ids.filter((id) => !id.startsWith("tmp_")),
      ]);
      setSelectedId((sel) => (sel && ids.includes(sel) ? null : sel));
    },
    [setSteps]
  );

  function addStep() {
    const id = `tmp_${tempCounter++}`;
    const order = Object.keys(steps).length;
    const newStep: StepData = {
      id,
      type: "email",
      stage: "interest",
      order,
      subject: "New step",
      body: "Hi {{firstName}},\n\n",
      delayDays: 2,
      delayHours: 0,
      position: { x: 250, y: 80 + order * 180 },
      variants: [],
    };
    setSteps((s) => ({ ...s, [id]: newStep }));
    setNodes((n) => [
      ...n,
      {
        id,
        position: newStep.position,
        data: { label: newStep.subject },
        style: nodeStyle(newStep.stage),
      },
    ]);
    setSelectedId(id);
  }

  function removeSelectedStep() {
    if (!selectedId) return;
    const id = selectedId;
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSteps((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
    if (!id.startsWith("tmp_")) setDeletedIds((prev) => [...prev, id]);
    setSelectedId(null);
  }

  function updateSelected(patch: Partial<StepData>) {
    if (!selectedId) return;
    setSteps((s) => ({
      ...s,
      [selectedId]: { ...s[selectedId]!, ...patch },
    }));
    if (patch.subject !== undefined) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedId
            ? { ...n, data: { ...n.data, label: patch.subject } }
            : n
        )
      );
    }
    if (patch.stage !== undefined) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedId ? { ...n, style: nodeStyle(patch.stage!) } : n
        )
      );
    }
  }

  function save() {
    // Sync node positions + edges back into step records.
    const posById = Object.fromEntries(nodes.map((n) => [n.id, n.position]));
    const list = Object.values(steps).map((s) => {
      const outgoing = edges.filter((e) => e.source === s.id);
      const noOpen = outgoing.find((e) => e.label === "no open")?.target ?? null;
      const replied = outgoing.find((e) => e.label === "replied")?.target ?? null;
      const opened = outgoing.find((e) => e.label === "opened")?.target ?? null;
      const isNew = s.id.startsWith("tmp_");
      return {
        id: isNew ? undefined : s.id,
        tempId: isNew ? s.id : undefined,
        type: s.type,
        stage: s.stage,
        order: s.order,
        subject: s.subject,
        body: s.body,
        delayDays: s.delayDays,
        delayHours: s.delayHours,
        nextIfNoOpen: noOpen,
        nextIfReplied: replied,
        nextIfOpened: opened,
        position: posById[s.id] ?? s.position,
      };
    });

    startTransition(async () => {
      const res = await saveSteps({
        campaignId,
        steps: list,
        deletedStepIds: deletedIds,
      });
      if (res.ok) {
        toast({ variant: "success", title: "Sequence saved" });
        setDeletedIds([]);
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Save failed",
          description: res.error,
        });
      }
    });
  }

  const selected = selectedId ? steps[selectedId] : null;
  const selectedIsPersisted = !!selected && !selected.id.startsWith("tmp_");

  function variantDraft(v: VariantData) {
    return variantDrafts[v.id] ?? { subject: v.subject, body: v.body };
  }

  function setVariantDraft(id: string, patch: Partial<{ subject: string; body: string }>) {
    setVariantDrafts((d) => {
      const v = selected?.variants.find((x) => x.id === id);
      const base = d[id] ?? { subject: v?.subject ?? "", body: v?.body ?? "" };
      return { ...d, [id]: { ...base, ...patch } };
    });
  }

  function saveVariant(v: VariantData) {
    const draft = variantDraft(v);
    startVariantTransition(async () => {
      const res = await updateStepVariant({
        variantId: v.id,
        subject: draft.subject,
        body: draft.body,
      });
      if (res.ok) {
        toast({ variant: "success", title: `Variant ${v.label} saved` });
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Variant save failed",
          description: res.error,
        });
      }
    });
  }

  function removeVariant(v: VariantData) {
    startVariantTransition(async () => {
      const res = await deleteStepVariant({ variantId: v.id });
      if (res.ok) {
        toast({ variant: "success", title: `Variant ${v.label} removed` });
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

  function addVariant() {
    if (!selectedId || !selectedIsPersisted) return;
    startVariantTransition(async () => {
      const res = await addStepVariant({ stepId: selectedId });
      if (res.ok) {
        toast({ variant: "success", title: "Variant added" });
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Add variant failed",
          description: res.error,
        });
      }
    });
  }

  return (
    <div className="flex h-full">
      <div className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodesDelete={onNodesDelete}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
        <div className="absolute left-3 top-3 flex gap-2">
          <Button size="sm" variant="secondary" onClick={addStep}>
            <Plus className="h-4 w-4" />
            Add step
          </Button>
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-card/90 px-2 py-1 text-xs text-muted-foreground shadow">
          Drag between steps to connect · click an edge to cycle its branch
          (no open → opened → replied)
        </p>
      </div>

      {selected && (
        <div className="w-80 shrink-0 space-y-3 overflow-y-auto border-l bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Edit step</h3>
            <div className="flex items-center gap-1">
              <Badge variant="secondary">
                {countVariants(selected.body)} spins
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Delete step"
                onClick={() => setConfirmDeleteStep(true)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Stage</Label>
            <Select
              value={selected.stage}
              onValueChange={(v) =>
                updateSelected({ stage: v as StepData["stage"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="awareness">Awareness</SelectItem>
                <SelectItem value="interest">Interest</SelectItem>
                <SelectItem value="demo">Demo</SelectItem>
                <SelectItem value="close">Close</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Delay (days)</Label>
              <Input
                type="number"
                min={0}
                value={selected.delayDays}
                onChange={(e) =>
                  updateSelected({ delayDays: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Delay (hours)</Label>
              <Input
                type="number"
                min={0}
                value={selected.delayHours}
                onChange={(e) =>
                  updateSelected({ delayHours: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Subject</Label>
            <Input
              value={selected.subject}
              onChange={(e) => updateSelected({ subject: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Body</Label>
            <Textarea
              rows={10}
              value={selected.body}
              onChange={(e) => updateSelected({ body: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Use {"{{firstName}}"} merge fields and {"{spin|tax}"} for
              variation.
            </p>
          </div>

          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                <FlaskConical className="h-4 w-4" />
                A/B variants
              </h4>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedIsPersisted || variantPending}
                onClick={addVariant}
              >
                {variantPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Add
              </Button>
            </div>
            {!selectedIsPersisted ? (
              <p className="text-xs text-muted-foreground">
                Save the sequence first, then add A/B variants to this step.
              </p>
            ) : selected.variants.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No variants yet — sends use the step copy above. Add one to
                start an A/B test; a winner is locked automatically after
                enough sends (replies first, opens as tiebreaker).
              </p>
            ) : (
              <div className="space-y-3">
                {selected.variants.map((v) => {
                  const draft = variantDraft(v);
                  return (
                    <div key={v.id} className="space-y-1.5 rounded-md border p-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={v.isWinner ? "success" : "secondary"}>
                          {v.label}
                        </Badge>
                        {v.isWinner && (
                          <Badge variant="success">
                            <Trophy className="mr-1 h-3 w-3" />
                            Winner
                          </Badge>
                        )}
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {v.sent} sent · {v.opens} opens · {v.replies} replies
                        </span>
                      </div>
                      <Input
                        className="h-8 text-xs"
                        value={draft.subject}
                        placeholder="Subject"
                        onChange={(e) =>
                          setVariantDraft(v.id, { subject: e.target.value })
                        }
                      />
                      <Textarea
                        rows={3}
                        className="text-xs"
                        value={draft.body}
                        placeholder="Body"
                        onChange={(e) =>
                          setVariantDraft(v.id, { body: e.target.value })
                        }
                      />
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={variantPending}
                          onClick={() => removeVariant(v)}
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={variantPending}
                          onClick={() => saveVariant(v)}
                        >
                          <Save className="h-3 w-3" />
                          Save
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteStep}
        onOpenChange={setConfirmDeleteStep}
        title="Delete this step?"
        description="The step and its branch edges are removed from the sequence when you save."
        confirmLabel="Delete step"
        destructive
        onConfirm={removeSelectedStep}
      />
    </div>
  );
}
