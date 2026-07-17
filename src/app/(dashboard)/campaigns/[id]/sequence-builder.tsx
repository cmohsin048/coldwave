"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
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
import { Loader2, Plus, Save } from "lucide-react";
import { countVariants } from "@/modules/spintax";
import { saveSteps } from "../actions";

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
}

const stageColor: Record<string, string> = {
  awareness: "#3b82f6",
  interest: "#8b5cf6",
  demo: "#f59e0b",
  close: "#22c55e",
};

let tempCounter = 0;

export function SequenceBuilder({
  campaignId,
  initialSteps,
}: {
  campaignId: string;
  initialSteps: StepData[];
}) {
  const [steps, setSteps] = useState<Record<string, StepData>>(() =>
    Object.fromEntries(initialSteps.map((s) => [s.id, s]))
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSteps[0]?.id ?? null
  );
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);

  const initialNodes: Node[] = useMemo(
    () =>
      initialSteps.map((s) => ({
        id: s.id,
        position: s.position,
        data: { label: s.subject || "(no subject)" },
        style: {
          borderLeft: `4px solid ${stageColor[s.stage]}`,
          borderRadius: 8,
          padding: 8,
          width: 220,
          fontSize: 12,
          background: "hsl(var(--card))",
          color: "hsl(var(--card-foreground))",
        },
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
    };
    setSteps((s) => ({ ...s, [id]: newStep }));
    setNodes((n) => [
      ...n,
      {
        id,
        position: newStep.position,
        data: { label: newStep.subject },
        style: {
          borderLeft: `4px solid ${stageColor[newStep.stage]}`,
          borderRadius: 8,
          padding: 8,
          width: 220,
          fontSize: 12,
          background: "hsl(var(--card))",
          color: "hsl(var(--card-foreground))",
        },
      },
    ]);
    setSelectedId(id);
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
  }

  function save() {
    setSaved(null);
    // Sync node positions + edges back into step records.
    const posById = Object.fromEntries(nodes.map((n) => [n.id, n.position]));
    const edgeMap = new Map<string, StepData["nextIfNoOpen"]>();
    const list = Object.values(steps).map((s) => {
      const outgoing = edges.filter((e) => e.source === s.id);
      const noOpen = outgoing.find((e) => e.label === "no open")?.target ?? null;
      const replied = outgoing.find((e) => e.label === "replied")?.target ?? null;
      const opened = outgoing.find((e) => e.label === "opened")?.target ?? null;
      return {
        id: s.id.startsWith("tmp_") ? undefined : s.id,
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
    void edgeMap;

    startTransition(async () => {
      const res = await saveSteps({ campaignId, steps: list });
      setSaved(res.ok ? "Saved." : res.error);
    });
  }

  const selected = selectedId ? steps[selectedId] : null;

  return (
    <div className="flex h-full">
      <div className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
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
          {saved && (
            <span className="self-center text-xs text-muted-foreground">
              {saved}
            </span>
          )}
        </div>
      </div>

      {selected && (
        <div className="w-80 shrink-0 space-y-3 overflow-y-auto border-l bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Edit step</h3>
            <Badge variant="secondary">
              {countVariants(selected.body)} variants
            </Badge>
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
              rows={12}
              value={selected.body}
              onChange={(e) => updateSelected({ body: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Use {"{{firstName}}"} merge fields and {"{spin|tax}"} for
              variation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
