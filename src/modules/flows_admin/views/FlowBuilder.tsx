"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  Download,
  History,
  LayoutGrid,
  Loader2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Webhook,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { Notice } from "@/components/app/Notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { IconPicker } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { EtViewProps } from "@/engine/views-registry";
import {
  CRON_PRESETS,
  OPERATION_DEFINITIONS,
  OPERATION_GROUPS,
  TRIGGER_DEFINITIONS,
  get_operation_definition,
  type FlowFieldDefinition,
} from "@/modules/flows/operation-catalog";
import type {
  FlowOperationRecord,
  FlowRecord,
  FlowRunRecord,
  FlowRunStepRecord,
  FlowRuntimeMode,
  FlowTrigger,
  FlowWithOperations,
} from "@/modules/flows/flow-types";
import { TRIGGER_LABELS } from "@/modules/flows/flow-types";
import { CopyButton } from "@/modules/cms_admin/views/ui";
import {
  FlowIcon,
  RunStatusBadge,
  StatusBadge,
  TriggerBadge,
  flows_call,
  format_datetime,
  format_duration,
  format_relative,
} from "./flow-ui";

const TRIGGER_NODE_ID = "__trigger__";
const ROOT_EDGE_ID = "__root__";

interface CollectionOption {
  name: string;
  label: string;
  primary_key: string;
}

interface FlowOption {
  id: string;
  name: string;
  trigger: FlowTrigger;
  status: string;
}

interface BuilderNodeData extends Record<string, unknown> {
  kind: "trigger" | "operation";
  name: string;
  key: string;
  type: string;
  options: Record<string, unknown>;
  icon: string;
  color: string;
  resolve: string | null;
  reject: string | null;
}

type BuilderNode = Node<BuilderNodeData>;

interface RunDetail {
  run: FlowRunRecord;
  steps: FlowRunStepRecord[];
  flow: FlowRecord | null;
}

interface BuilderProps extends Record<string, unknown> {
  flow: FlowWithOperations;
  flows: FlowOption[];
  collections: CollectionOption[];
  runs: FlowRunRecord[];
  runtime: FlowRuntimeMode;
  webhook_url: string | null;
  origin: string;
}

interface SaveGraphResult {
  flow: FlowWithOperations;
}

interface TriggerUpdateResult {
  flow: FlowRecord;
  secret: string | null;
  webhook_url: string | null;
}

function root_of(flow: FlowWithOperations): string | null {
  if (flow.operation && flow.operations.some((op) => op.id === flow.operation)) {
    return flow.operation;
  }
  const targeted = new Set(
    flow.operations.flatMap((op) =>
      [op.resolve, op.reject].filter((value): value is string => Boolean(value))
    )
  );
  return (
    flow.operations.find((op) => !targeted.has(op.id))?.id ??
    flow.operations[0]?.id ??
    null
  );
}

function operation_node(operation: FlowOperationRecord): BuilderNode {
  const definition = get_operation_definition(operation.type);
  return {
    id: operation.id,
    type: "flow",
    position: { x: operation.position_x, y: operation.position_y },
    data: {
      kind: "operation",
      name: operation.name,
      key: operation.key,
      type: operation.type,
      options: operation.options,
      icon: definition?.icon ?? "box",
      color: definition?.color ?? "#64748b",
      resolve: operation.resolve,
      reject: operation.reject,
    },
  };
}

function trigger_node(trigger: FlowTrigger, x: number, y: number): BuilderNode {
  const definition = TRIGGER_DEFINITIONS.find((entry) => entry.type === trigger);
  return {
    id: TRIGGER_NODE_ID,
    type: "flow",
    position: { x, y },
    draggable: true,
    deletable: false,
    data: {
      kind: "trigger",
      name: TRIGGER_LABELS[trigger],
      key: "trigger",
      type: trigger,
      options: {},
      icon: definition?.icon ?? "zap",
      color: definition?.color ?? "#6366f1",
      resolve: null,
      reject: null,
    },
  };
}

function root_edge(target: string): Edge {
  return {
    id: ROOT_EDGE_ID,
    source: TRIGGER_NODE_ID,
    sourceHandle: "root",
    target,
    targetHandle: "in",
    type: "smoothstep",
    style: { strokeWidth: 1.6 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  };
}

function operation_edge(
  source: string,
  handle: "resolve" | "reject",
  target: string
): Edge {
  return {
    id: `${source}:${handle}:${target}`,
    source,
    sourceHandle: handle,
    target,
    targetHandle: "in",
    type: "smoothstep",
    label: handle === "reject" ? "reject" : undefined,
    style: {
      strokeWidth: 1.6,
      stroke: handle === "reject" ? "#ef4444" : "#10b981",
    },
    labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
    labelBgStyle: { fill: "var(--card)" },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: handle === "reject" ? "#ef4444" : "#10b981",
    },
  };
}

function build_edges(
  operations: FlowOperationRecord[],
  rootId: string | null
): Edge[] {
  const ids = new Set(operations.map((operation) => operation.id));
  const edges: Edge[] = [];
  if (rootId && ids.has(rootId)) edges.push(root_edge(rootId));
  for (const operation of operations) {
    if (operation.resolve && ids.has(operation.resolve)) {
      edges.push(operation_edge(operation.id, "resolve", operation.resolve));
    }
    if (operation.reject && ids.has(operation.reject)) {
      edges.push(operation_edge(operation.id, "reject", operation.reject));
    }
  }
  return edges;
}

function layout_graph(nodes: BuilderNode[], edges: Edge[]): BuilderNode[] {
  if (nodes.length === 0) return nodes;
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    nodesep: 40,
    ranksep: 100,
    marginx: 24,
    marginy: 24,
  });
  for (const node of nodes) {
    graph.setNode(node.id, { width: 240, height: 92 });
  }
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);
  return nodes.map((node) => {
    const position = graph.node(node.id) as
      | { x?: number; y?: number }
      | undefined;
    if (!position || typeof position.x !== "number" || typeof position.y !== "number") {
      return node;
    }
    return {
      ...node,
      position: { x: position.x - 120, y: position.y - 46 },
    };
  });
}

function unique_key(base: string, nodes: BuilderNode[]): string {
  const used = new Set(nodes.map((node) => node.data.key));
  const normalized =
    base
      .replace(/[^a-z0-9_]/gi, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase() || "step";
  const candidate = /^[a-z]/.test(normalized) ? normalized : `step_${normalized}`;
  if (!used.has(candidate)) return candidate;
  for (let index = 2; index < 200; index += 1) {
    const next = `${candidate}_${index}`;
    if (!used.has(next)) return next;
  }
  return `${candidate}_${Date.now()}`;
}

const FlowNodeCard = ({ data, selected }: NodeProps<BuilderNode>) => {
  const is_trigger = data.kind === "trigger";
  return (
    <div
      className={cn(
        "w-[240px] rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition-shadow",
        selected
          ? "border-primary shadow-[0_0_0_3px_var(--ring)]"
          : "border-border",
        is_trigger && "bg-surface-subtle"
      )}
      style={{ borderLeftColor: data.color, borderLeftWidth: 4 }}
    >
      {!is_trigger ? (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          className="!size-2.5 !border-2 !border-card !bg-foreground"
        />
      ) : null}
      <div className="flex items-start gap-2.5">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card"
          style={{ color: data.color }}
        >
          <DynamicIcon name={data.icon} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-5">{data.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {is_trigger ? "Trigger" : `${data.type} · ${data.key}`}
          </p>
        </div>
        {is_trigger ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Start
          </span>
        ) : null}
      </div>
      {is_trigger ? (
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Connect the trigger to the first step</span>
          <Handle
            type="source"
            position={Position.Right}
            id="root"
            className="!size-2.5 !border-2 !border-card !bg-primary"
          />
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="flex items-center gap-1">
              <CircleDot className="size-2.5 text-emerald-500" /> Resolve
            </span>
            <span className="flex items-center gap-1">
              <CircleDot className="size-2.5 text-red-500" /> Reject
            </span>
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="resolve"
            style={{ top: "62%" }}
            className="!size-2.5 !border-2 !border-card !bg-emerald-500"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="reject"
            style={{ top: "86%" }}
            className="!size-2.5 !border-2 !border-card !bg-red-500"
          />
        </>
      )}
    </div>
  );
};

const NODE_TYPES = { flow: FlowNodeCard } as unknown as Record<
  string,
  ComponentType<NodeProps>
>;

function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      {children}
      {hint ? (
        <span className="text-[11px] leading-snug text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function JsonField({
  value,
  onChange,
  rows = 6,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  rows?: number;
}) {
  const [text, set_text] = useState(() => {
    try {
      return JSON.stringify(value ?? {}, null, 2);
    } catch {
      return "{}";
    }
  });
  const [error, set_error] = useState<string | null>(null);

  return (
    <div className="grid gap-1">
      <Textarea
        value={text}
        rows={rows}
        spellCheck={false}
        className="min-h-24 font-mono text-xs"
        onChange={(event) => {
          const next = event.target.value;
          set_text(next);
          try {
            const parsed = next.trim() ? (JSON.parse(next) as unknown) : {};
            set_error(null);
            onChange(parsed);
          } catch {
            set_error("Invalid JSON");
          }
        }}
      />
      {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
    </div>
  );
}

function OptionField({
  field,
  value,
  onChange,
  collections,
  flows,
}: {
  field: FlowFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  collections: CollectionOption[];
  flows: FlowOption[];
}) {
  if (field.type === "json") {
    return (
      <FieldShell label={field.label} hint={field.description}>
        <JsonField value={value} onChange={onChange} />
      </FieldShell>
    );
  }
  if (field.type === "boolean") {
    return (
      <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
        <span>
          {field.label}
          {field.description ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {field.description}
            </span>
          ) : null}
        </span>
        <Switch checked={value === true} onCheckedChange={onChange} />
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <FieldShell label={field.label} hint={field.description}>
        <Select
          value={String(value ?? field.defaultValue ?? "")}
          onValueChange={onChange}
        >
          <SelectTrigger className="h-10 w-full">
            <SelectValue placeholder={field.placeholder ?? "Choose"} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
    );
  }
  if (field.type === "collection") {
    return (
      <FieldShell label={field.label} hint={field.description}>
        <Select value={String(value ?? "")} onValueChange={onChange}>
          <SelectTrigger className="h-10 w-full">
            <SelectValue placeholder="Choose a collection" />
          </SelectTrigger>
          <SelectContent>
            {collections.map((collection) => (
              <SelectItem key={collection.name} value={collection.name}>
                {collection.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
    );
  }
  if (field.type === "flow") {
    return (
      <FieldShell label={field.label} hint={field.description}>
        <Select value={String(value ?? "")} onValueChange={onChange}>
          <SelectTrigger className="h-10 w-full">
            <SelectValue placeholder="Choose a flow" />
          </SelectTrigger>
          <SelectContent>
            {flows.map((flow) => (
              <SelectItem key={flow.id} value={flow.id}>
                {flow.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
    );
  }
  if (field.type === "cron") {
    return (
      <FieldShell label={field.label} hint={field.description}>
        <Input
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder ?? "0 * * * *"}
          className="font-mono"
        />
        <div className="flex flex-wrap gap-1.5">
          {CRON_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange(preset.value)}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </FieldShell>
    );
  }
  if (field.type === "number") {
    return (
      <FieldShell label={field.label} hint={field.description}>
        <Input
          type="number"
          value={
            typeof value === "number" || typeof value === "string"
              ? value
              : ""
          }
          onChange={(event) => {
            const next = event.target.value;
            onChange(next === "" ? undefined : Number(next));
          }}
          placeholder={field.placeholder}
        />
      </FieldShell>
    );
  }
  if (field.type === "textarea") {
    return (
      <FieldShell label={field.label} hint={field.description}>
        <Textarea
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          rows={field.rows ?? 4}
        />
      </FieldShell>
    );
  }
  return (
    <FieldShell label={field.label} hint={field.description}>
      <Input
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
      />
    </FieldShell>
  );
}

function use_dirty_guard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

function BuilderCanvas({ data }: { data: BuilderProps }) {
  const flow = data.flow;
  const { fitView } = useReactFlow();
  const { confirm, dialog: confirm_dialog } = useConfirm();

  const initial_root = useMemo(() => root_of(flow), [flow]);
  const [nodes, set_nodes] = useState<BuilderNode[]>(() => {
    const operations = flow.operations.map(operation_node);
    if (operations.length === 0) return [trigger_node(flow.trigger, 40, 160)];
    const root = operations.find((node) => node.id === initial_root) ?? operations[0];
    const trigger_x = root.position.x - 300;
    return [trigger_node(flow.trigger, trigger_x, root.position.y), ...operations];
  });
  const [edges, set_edges] = useState<Edge[]>(() =>
    build_edges(flow.operations, initial_root)
  );
  const [root_id, set_root_id] = useState<string | null>(initial_root);
  const [selected_id, set_selected_id] = useState<string | null>(null);
  const [revision, set_revision] = useState(flow.revision);
  const [current_flow, set_current_flow] = useState<FlowRecord>(flow);
  const [dirty, set_dirty] = useState(false);
  const [saving, set_saving] = useState(false);
  const [running, set_running] = useState(false);
  const [activating, set_activating] = useState(false);

  const [name, set_name] = useState(flow.name);
  const [description, set_description] = useState(flow.description);
  const [icon, set_icon] = useState(flow.icon);
  const [color, set_color] = useState(flow.color);
  const [accountability, set_accountability] = useState<"all" | "activity" | "none">(
    flow.accountability ?? "none"
  );
  const [trigger_options, set_trigger_options] = useState<Record<string, unknown>>(
    () => ({ ...flow.options })
  );
  const [trigger_saving, set_trigger_saving] = useState(false);
  const [meta_saving, set_meta_saving] = useState(false);
  const [secret, set_secret] = useState<{
    secret: string;
    url: string | null;
  } | null>(null);

  const [palette_open, set_palette_open] = useState(false);
  const [palette_query, set_palette_query] = useState("");
  const [logs_open, set_logs_open] = useState(false);
  const [runs, set_runs] = useState<FlowRunRecord[]>(data.runs ?? []);
  const [logs_loading, set_logs_loading] = useState(false);
  const [run_detail, set_run_detail] = useState<RunDetail | null>(null);
  const [detail_loading, set_detail_loading] = useState(false);

  use_dirty_guard(dirty);

  const selected_node = useMemo(
    () => nodes.find((node) => node.id === selected_id) ?? null,
    [nodes, selected_id]
  );

  const update_node = useCallback(
    (id: string, patch: Partial<BuilderNodeData>) => {
      set_nodes((current) =>
        current.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...patch } } : node
        )
      );
      set_dirty(true);
    },
    []
  );

  const on_nodes_change = useCallback(
    (changes: NodeChange<BuilderNode>[]) => {
      const filtered = changes.filter(
        (change) => !(change.type === "remove" && change.id === TRIGGER_NODE_ID)
      );
      set_nodes((current) => applyNodeChanges(filtered, current) as BuilderNode[]);
      const removed = filtered
        .filter((change) => change.type === "remove")
        .map((change) => change.id);
      if (removed.length > 0) {
        set_edges((current) =>
          current.filter(
            (edge) =>
              !removed.includes(edge.source) && !removed.includes(edge.target)
          )
        );
        if (root_id && removed.includes(root_id)) set_root_id(null);
      }
      if (
        filtered.some(
          (change) => change.type === "position" || change.type === "remove"
        )
      ) {
        set_dirty(true);
      }
    },
    [root_id]
  );

  const on_edges_change = useCallback((changes: EdgeChange[]) => {
    set_edges((current) => applyEdgeChanges(changes, current));
  }, []);

  const on_edges_delete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) {
        if (edge.id === ROOT_EDGE_ID || edge.source === TRIGGER_NODE_ID) {
          set_root_id(null);
          continue;
        }
        if (edge.sourceHandle === "resolve" || edge.sourceHandle === "reject") {
          const handle = edge.sourceHandle;
          set_nodes((current) =>
            current.map((node) =>
              node.id === edge.source
                ? { ...node, data: { ...node.data, [handle]: null } }
                : node
            )
          );
        }
      }
      set_dirty(true);
    },
    []
  );

  const on_connect = useCallback(
    (connection: Connection) => {
      const { source, target, sourceHandle } = connection;
      if (!source || !target || source === target) return;
      if (target === TRIGGER_NODE_ID) return;

      if (source === TRIGGER_NODE_ID) {
        if (sourceHandle !== "root") return;
        set_root_id(target);
        set_edges((current) => [
          ...current.filter((edge) => edge.id !== ROOT_EDGE_ID),
          root_edge(target),
        ]);
        set_dirty(true);
        return;
      }
      if (sourceHandle !== "resolve" && sourceHandle !== "reject") return;
      const handle = sourceHandle;
      set_nodes((current) =>
        current.map((node) =>
          node.id === source
            ? { ...node, data: { ...node.data, [handle]: target } }
            : node
        )
      );
      set_edges((current) => [
        ...current.filter(
          (edge) => !(edge.source === source && edge.sourceHandle === handle)
        ),
        operation_edge(source, handle, target),
      ]);
      set_dirty(true);
    },
    []
  );

  const add_operation = useCallback(
    (type: string) => {
      const definition = get_operation_definition(type);
      if (!definition) return;
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      set_nodes((current) => {
        const key = unique_key(type, current);
        const selected = current.find((node) => node.id === selected_id);
        const base_x = selected ? selected.position.x + 300 : 360;
        const base_y = selected
          ? selected.position.y + current.length * 8
          : 120 + current.length * 30;
        const next: BuilderNode = {
          id,
          type: "flow",
          position: { x: base_x, y: base_y },
          data: {
            kind: "operation",
            name: definition.label,
            key,
            type,
            options: structuredClone(definition.defaultOptions),
            icon: definition.icon,
            color: definition.color,
            resolve: null,
            reject: null,
          },
        };
        const updated = selected && !selected.data.resolve
          ? current.map((node) =>
              node.id === selected.id
                ? { ...node, data: { ...node.data, resolve: id } }
                : node
            )
          : current;
        return [...updated, next];
      });

      const selected = nodes.find((node) => node.id === selected_id);
      if (selected && !selected.data.resolve) {
        set_edges((current) => [
          ...current.filter(
            (edge) =>
              !(edge.source === selected.id && edge.sourceHandle === "resolve")
          ),
          operation_edge(selected.id, "resolve", id),
        ]);
      } else if (!root_id) {
        set_root_id(id);
        set_edges((current) => [
          ...current.filter((edge) => edge.id !== ROOT_EDGE_ID),
          root_edge(id),
        ]);
      }
      set_selected_id(id);
      set_palette_open(false);
      set_palette_query("");
      set_dirty(true);
    },
    [nodes, root_id, selected_id]
  );

  const delete_selected = useCallback(async () => {
    if (!selected_node || selected_node.data.kind === "trigger") return;
    const approved = await confirm({
      title: "Delete this step?",
      description: (
        <>
          <span className="font-semibold">{selected_node.data.name}</span> will
          be removed and its links cleared.
        </>
      ),
      confirmLabel: "Delete step",
      tone: "destructive",
    });
    if (!approved) return;
    const id = selected_node.id;
    set_nodes((current) => current.filter((node) => node.id !== id));
    set_edges((current) =>
      current.filter((edge) => edge.source !== id && edge.target !== id)
    );
    if (root_id === id) set_root_id(null);
    set_selected_id(null);
    set_dirty(true);
  }, [confirm, root_id, selected_node]);

  const tidy = useCallback(() => {
    set_nodes((current) => layout_graph(current, edges));
    set_dirty(true);
    window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 300 });
    }, 40);
  }, [edges, fitView]);

  const save_graph = useCallback(async () => {
    set_saving(true);
    try {
      const operations = nodes
        .filter((node) => node.data.kind === "operation")
        .map((node) => ({
          id: node.id,
          name: node.data.name,
          key: node.data.key,
          type: node.data.type,
          options: node.data.options,
          position_x: node.position.x,
          position_y: node.position.y,
          resolve: node.data.resolve,
          reject: node.data.reject,
        }));
      const result = await flows_call<SaveGraphResult>("save_graph", {
        id: flow.id,
        revision,
        operations,
        root: root_id,
      });
      set_revision(result.flow.revision);
      set_current_flow(result.flow);
      set_root_id(result.flow.operation);
      set_edges((current) => {
        const rest = current.filter(
          (edge) => edge.id !== ROOT_EDGE_ID && edge.source !== TRIGGER_NODE_ID
        );
        return result.flow.operation
          ? [...rest, root_edge(result.flow.operation)]
          : rest;
      });
      set_dirty(false);
      toast.success("Flow graph saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the flow."
      );
    } finally {
      set_saving(false);
    }
  }, [flow.id, nodes, revision, root_id]);

  const save_meta = useCallback(async () => {
    set_meta_saving(true);
    try {
      const result = await flows_call<{ flow: FlowRecord }>("update_flow", {
        id: flow.id,
        name,
        description,
        icon,
        color,
        accountability: accountability === "none" ? null : accountability,
      });
      set_current_flow(result.flow);
      toast.success("Flow setup saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save flow setup."
      );
    } finally {
      set_meta_saving(false);
    }
  }, [accountability, color, description, flow.id, icon, name]);

  const save_trigger = useCallback(async () => {
    set_trigger_saving(true);
    try {
      const result = await flows_call<TriggerUpdateResult>("update_trigger", {
        id: flow.id,
        trigger: flow.trigger,
        options: trigger_options,
      });
      set_current_flow(result.flow);
      set_trigger_options({ ...result.flow.options });
      if (result.secret) {
        set_secret({ secret: result.secret, url: result.webhook_url });
      }
      toast.success("Trigger settings saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the trigger."
      );
    } finally {
      set_trigger_saving(false);
    }
  }, [flow.id, flow.trigger, trigger_options]);

  const toggle_status = useCallback(async () => {
    set_activating(true);
    try {
      const next = current_flow.status === "active" ? "inactive" : "active";
      const result = await flows_call<{ flow: FlowRecord }>("set_status", {
        id: flow.id,
        status: next,
      });
      set_current_flow(result.flow);
      toast.success(
        next === "active" ? "Flow activated." : "Flow deactivated."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not change the status."
      );
    } finally {
      set_activating(false);
    }
  }, [current_flow.status, flow.id]);

  const load_runs = useCallback(async () => {
    set_logs_loading(true);
    try {
      const result = await flows_call<{ runs: FlowRunRecord[] }>("runs", {
        flow_id: flow.id,
        limit: 30,
      });
      set_runs(result.runs);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load run logs."
      );
    } finally {
      set_logs_loading(false);
    }
  }, [flow.id]);

  const open_logs = useCallback(() => {
    set_logs_open(true);
    set_run_detail(null);
    void load_runs();
  }, [load_runs]);

  const open_run_detail = useCallback(async (run: FlowRunRecord) => {
    set_detail_loading(true);
    set_run_detail(null);
    try {
      const result = await flows_call<RunDetail>("run_detail", { id: run.id });
      set_run_detail(result);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load the run."
      );
    } finally {
      set_detail_loading(false);
    }
  }, []);

  const run_now = useCallback(async () => {
    set_running(true);
    try {
      if (dirty) await save_graph();
      const result = await flows_call<{
        status?: string;
        queued?: boolean;
        error?: { message?: string } | null;
      }>("run_now", { id: flow.id, input: null, sync: true });
      if (result.queued) {
        toast.info("Run queued. It will start shortly.");
      } else if (result.status === "success") {
        toast.success("Flow ran successfully.");
      } else if (result.status === "rejected") {
        toast.warning(result.error?.message ?? "The flow rejected this run.");
      } else if (result.error?.message) {
        throw new Error(result.error.message);
      }
      set_logs_open(true);
      await load_runs();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not run the flow."
      );
    } finally {
      set_running(false);
    }
  }, [dirty, flow.id, load_runs, save_graph]);

  const rotate_secret = useCallback(async () => {
    try {
      const result = await flows_call<{
        flow: FlowRecord;
        secret: string;
        webhook_url: string;
      }>("rotate_secret", { id: flow.id });
      set_current_flow(result.flow);
      set_secret({ secret: result.secret, url: result.webhook_url });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not rotate the secret."
      );
    }
  }, [flow.id]);

  const export_flow = useCallback(async () => {
    try {
      if (dirty) await save_graph();
      const exported = await flows_call<Record<string, unknown>>("export_flow", {
        id: flow.id,
      });
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${flow.name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}-flow.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not export the flow."
      );
    }
  }, [dirty, flow.id, flow.name, save_graph]);

  const filtered_operations = useMemo(() => {
    const term = palette_query.trim().toLowerCase();
    if (!term) return OPERATION_DEFINITIONS;
    return OPERATION_DEFINITIONS.filter(
      (definition) =>
        definition.label.toLowerCase().includes(term) ||
        definition.type.toLowerCase().includes(term) ||
        definition.description.toLowerCase().includes(term)
    );
  }, [palette_query]);

  const toggle_option = useCallback(
    (key: string, value: string) => {
      set_trigger_options((current) => {
        const list = Array.isArray(current[key])
          ? (current[key] as unknown[]).map(String)
          : [];
        return {
          ...current,
          [key]: list.includes(value)
            ? list.filter((entry) => entry !== value)
            : [...list, value],
        };
      });
    },
    []
  );

  const check_option = useCallback(
    (key: string, value: string) => {
      const list = Array.isArray(trigger_options[key])
        ? (trigger_options[key] as unknown[]).map(String)
        : [];
      return list.includes(value);
    },
    [trigger_options]
  );

  const trigger_definition = TRIGGER_DEFINITIONS.find(
    (entry) => entry.type === flow.trigger
  );

  const inspector_is_trigger =
    !selected_node || selected_node.data.kind === "trigger";

  return (
    <div className="space-y-4">
      {confirm_dialog}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild title="Back to flows">
          <Link href="/admin/flows">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <FlowIcon flow={{ icon, color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="type-title truncate">{current_flow.name}</h1>
            <StatusBadge status={current_flow.status} />
            <TriggerBadge trigger={flow.trigger} />
            <Badge variant="outline">rev {revision}</Badge>
            {dirty ? <Badge variant="warning">Unsaved</Badge> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {flow.description || "No description."} · Updated{" "}
            {format_relative(current_flow.updated_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={export_flow}>
            <Download className="size-3.5" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={open_logs}>
            <History className="size-3.5" /> Logs
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={run_now}
            disabled={running}
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            Run
          </Button>
          <Button
            variant={current_flow.status === "active" ? "outline" : "default"}
            size="sm"
            onClick={toggle_status}
            disabled={activating}
          >
            {activating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : current_flow.status === "active" ? (
              <X className="size-3.5" />
            ) : (
              <Check className="size-3.5" />
            )}
            {current_flow.status === "active" ? "Deactivate" : "Activate"}
          </Button>
          <Button size="sm" onClick={save_graph} disabled={saving}>
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      {!data.runtime.enabled || data.runtime.missing.length > 0 ? (
        <Notice
          icon={AlertTriangle}
          tone={data.runtime.enabled ? "warning" : "destructive"}
        >
          {data.runtime.enabled
            ? `This runtime is not ready: ${data.runtime.missing.join(", ")}.`
            : "Flows are disabled on this server. Set FLOWS_ENABLED=1 to enable them."}
        </Notice>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <Button size="sm" onClick={() => set_palette_open(true)}>
              <Plus className="size-3.5" /> Add step
            </Button>
            <Button variant="outline" size="sm" onClick={tidy}>
              <LayoutGrid className="size-3.5" /> Tidy layout
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fitView({ padding: 0.2, duration: 300 })}
            >
              <RefreshCw className="size-3.5" /> Fit
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Drag from a green dot for resolve, a red dot for reject.
            </span>
          </div>
          <div className="h-[calc(100dvh-20rem)] min-h-[460px] w-full">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={on_nodes_change}
              onEdgesChange={on_edges_change}
              onEdgesDelete={on_edges_delete}
              onConnect={on_connect}
              onSelectionChange={({ nodes: selected }) =>
                set_selected_id(selected[0]?.id ?? null)
              }
              onPaneClick={() => set_selected_id(null)}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: false }}
              defaultEdgeOptions={{
                type: "smoothstep",
                markerEnd: { type: MarkerType.ArrowClosed },
              }}
            >
              <Background gap={18} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(node) =>
                  (node.data as BuilderNodeData)?.color ?? "#94a3b8"
                }
              />
            </ReactFlow>
          </div>
        </div>

        <aside className="min-h-0 space-y-4 xl:max-h-[calc(100dvh-14rem)] xl:overflow-y-auto xl:pr-1">
          {inspector_is_trigger ? (
            <>
              <section className="space-y-4 rounded-xl border border-border bg-card p-4">
                <header className="flex items-center gap-2">
                  <Zap className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Flow setup</h2>
                </header>
                <FieldShell label="Name">
                  <Input
                    value={name}
                    onChange={(event) => set_name(event.target.value)}
                  />
                </FieldShell>
                <FieldShell label="Description">
                  <Textarea
                    value={description}
                    onChange={(event) => set_description(event.target.value)}
                    className="min-h-16"
                    rows={3}
                  />
                </FieldShell>
                <FieldShell label="Icon">
                  <IconPicker value={icon} onChange={set_icon} color={color} />
                </FieldShell>
                <FieldShell label="Color">
                  <ColorPicker value={color} onChange={set_color} />
                </FieldShell>
                <FieldShell
                  label="Activity & logs tracking"
                  hint="Keep the principal, input, step output and errors for every run."
                >
                  <Select
                    value={accountability}
                    onValueChange={(value) =>
                      set_accountability(value as "all" | "activity" | "none")
                    }
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Activity and logs</SelectItem>
                      <SelectItem value="activity">Activity only</SelectItem>
                      <SelectItem value="none">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldShell>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={save_meta}
                  disabled={meta_saving}
                >
                  {meta_saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save setup
                </Button>
              </section>

              <section className="space-y-4 rounded-xl border border-border bg-card p-4">
                <header className="flex items-center gap-2">
                  <DynamicIcon
                    name={trigger_definition?.icon ?? "zap"}
                    size={16}
                  />
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">
                      {trigger_definition?.label}
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      {trigger_definition?.description}
                    </p>
                  </div>
                </header>

                {flow.trigger === "event" ? (
                  <>
                    <FieldShell label="Type">
                      <Select
                        value={String(trigger_options.type ?? "filter")}
                        onValueChange={(value) =>
                          set_trigger_options((current) => ({
                            ...current,
                            type: value,
                          }))
                        }
                      >
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="filter">
                            Filter (blocking)
                          </SelectItem>
                          <SelectItem value="action">
                            Action (non-blocking)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldShell>
                    <FieldShell
                      label="Collections"
                      hint="The hook runs for these collections."
                    >
                      <div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border border-border bg-surface-subtle p-2">
                        {data.collections.length === 0 ? (
                          <p className="p-2 text-xs text-muted-foreground">
                            No collections yet.
                          </p>
                        ) : (
                          data.collections.map((collection) => (
                            <label
                              key={collection.name}
                              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
                            >
                              <Checkbox
                                checked={check_option("collections", collection.name)}
                                onCheckedChange={() =>
                                  toggle_option("collections", collection.name)
                                }
                              />
                              {collection.label}
                            </label>
                          ))
                        )}
                      </div>
                    </FieldShell>
                    <FieldShell label="Events">
                      <div className="flex flex-wrap gap-3">
                        {(["create", "update", "delete"] as const).map((action) => (
                          <label
                            key={action}
                            className="flex items-center gap-2 text-sm capitalize"
                          >
                            <Checkbox
                              checked={check_option("actions", action)}
                              onCheckedChange={() =>
                                toggle_option("actions", action)
                              }
                            />
                            {action}
                          </label>
                        ))}
                      </div>
                    </FieldShell>
                  </>
                ) : null}

                {flow.trigger === "webhook" ? (
                  <>
                    <FieldShell label="Method">
                      <Select
                        value={String(trigger_options.method ?? "POST")}
                        onValueChange={(value) =>
                          set_trigger_options((current) => ({
                            ...current,
                            method: value,
                          }))
                        }
                      >
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["POST", "GET", "PUT", "PATCH", "DELETE"].map(
                            (method) => (
                              <SelectItem key={method} value={method}>
                                {method}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </FieldShell>
                    <FieldShell label="Response body">
                      <Select
                        value={String(trigger_options.response_body ?? "last")}
                        onValueChange={(value) =>
                          set_trigger_options((current) => ({
                            ...current,
                            response_body: value,
                          }))
                        }
                      >
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="last">
                            Data of the last operation
                          </SelectItem>
                          <SelectItem value="all">All operation data</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldShell>
                    {trigger_options.response_body === "other" ? (
                      <FieldShell label="Custom response">
                        <Input
                          value={String(
                            trigger_options.response_body_other ?? ""
                          )}
                          onChange={(event) =>
                            set_trigger_options((current) => ({
                              ...current,
                              response_body_other: event.target.value,
                            }))
                          }
                          placeholder="{{ $last }}"
                        />
                      </FieldShell>
                    ) : null}
                    <div className="grid gap-2">
                      {[
                        {
                          key: "async",
                          title: "Async",
                          hint: "Respond immediately and run in the queue.",
                        },
                        {
                          key: "error_on_reject",
                          title: "Error on reject",
                          hint: "Return an error status when the flow rejects.",
                        },
                        {
                          key: "cache",
                          title: "Cache GET responses",
                          hint: "Keep successful GET results for 30 seconds.",
                        },
                        {
                          key: "public",
                          title: "Public endpoint",
                          hint: "Skip the per-flow secret. Not recommended.",
                        },
                      ].map((option) => (
                        <label
                          key={option.key}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
                        >
                          <span>
                            {option.title}
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {option.hint}
                            </span>
                          </span>
                          <Switch
                            checked={
                              option.key === "error_on_reject"
                                ? trigger_options.error_on_reject !== false
                                : trigger_options[option.key] === true
                            }
                            onCheckedChange={(checked) =>
                              set_trigger_options((current) => ({
                                ...current,
                                [option.key]: checked,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                    {data.webhook_url ? (
                      <div className="grid gap-1.5">
                        <span className="text-xs font-semibold">Webhook URL</span>
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            value={data.webhook_url}
                            className="h-10 font-mono text-[11px]"
                          />
                          <CopyButton value={data.webhook_url} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={rotate_secret}
                          >
                            <Lock className="size-3.5" /> Rotate secret
                          </Button>
                          {current_flow.secret_prefix ? (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {current_flow.secret_prefix}…
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {flow.trigger === "schedule" ? (
                  <>
                    <FieldShell
                      label="CRON interval (UTC)"
                      hint="Five fields: minute hour day month weekday. Schedules run in UTC."
                    >
                      <Input
                        value={String(trigger_options.interval ?? "")}
                        onChange={(event) =>
                          set_trigger_options((current) => ({
                            ...current,
                            interval: event.target.value,
                          }))
                        }
                        placeholder="0 * * * *"
                        className="font-mono"
                      />
                    </FieldShell>
                    <div className="flex flex-wrap gap-1.5">
                      {CRON_PRESETS.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() =>
                            set_trigger_options((current) => ({
                              ...current,
                              interval: preset.value,
                            }))
                          }
                          className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Next run:{" "}
                      {current_flow.next_run_at
                        ? format_datetime(current_flow.next_run_at)
                        : "saved when the flow is active"}
                    </p>
                  </>
                ) : null}

                {flow.trigger === "operation" ? (
                  <>
                    <FieldShell label="Response body">
                      <Select
                        value={String(trigger_options.response_body ?? "last")}
                        onValueChange={(value) =>
                          set_trigger_options((current) => ({
                            ...current,
                            response_body: value,
                          }))
                        }
                      >
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="last">
                            Data of the last operation
                          </SelectItem>
                          <SelectItem value="all">All operation data</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldShell>
                    {trigger_options.response_body === "other" ? (
                      <FieldShell label="Custom response">
                        <Input
                          value={String(
                            trigger_options.response_body_other ?? ""
                          )}
                          onChange={(event) =>
                            set_trigger_options((current) => ({
                              ...current,
                              response_body_other: event.target.value,
                            }))
                          }
                          placeholder="{{ $last }}"
                        />
                      </FieldShell>
                    ) : null}
                  </>
                ) : null}

                {flow.trigger === "manual" ? (
                  <>
                    <FieldShell label="Collections">
                      <div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border border-border bg-surface-subtle p-2">
                        {data.collections.map((collection) => (
                          <label
                            key={collection.name}
                            className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
                          >
                            <Checkbox
                              checked={check_option("collections", collection.name)}
                              onCheckedChange={() =>
                                toggle_option("collections", collection.name)
                              }
                            />
                            {collection.label}
                          </label>
                        ))}
                      </div>
                    </FieldShell>
                    <FieldShell label="Location">
                      <div className="flex flex-wrap gap-3">
                        {(["collection", "item"] as const).map((location) => (
                          <label
                            key={location}
                            className="flex items-center gap-2 text-sm capitalize"
                          >
                            <Checkbox
                              checked={check_option("location", location)}
                              onCheckedChange={() =>
                                toggle_option("location", location)
                              }
                            />
                            {location} page
                          </label>
                        ))}
                      </div>
                    </FieldShell>
                    <div className="grid gap-2">
                      {[
                        {
                          key: "collection_page_requires_selection",
                          title: "Requires selection",
                          hint: "On collection pages, run for selected items only.",
                          fallback: true,
                        },
                        {
                          key: "require_confirmation",
                          title: "Require confirmation",
                          hint: "Ask before starting the flow.",
                          fallback: false,
                        },
                        {
                          key: "async",
                          title: "Async",
                          hint: "Queue the run instead of waiting for it.",
                          fallback: false,
                        },
                        {
                          key: "error_on_reject",
                          title: "Error on reject",
                          hint: "Show a rejected result to the operator.",
                          fallback: true,
                        },
                      ].map((option) => (
                        <label
                          key={option.key}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
                        >
                          <span>
                            {option.title}
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {option.hint}
                            </span>
                          </span>
                          <Switch
                            checked={
                              trigger_options[option.key] === undefined
                                ? option.fallback
                                : trigger_options[option.key] === true
                            }
                            onCheckedChange={(checked) =>
                              set_trigger_options((current) => ({
                                ...current,
                                [option.key]: checked,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </>
                ) : null}

                <Button
                  className="w-full"
                  variant="outline"
                  onClick={save_trigger}
                  disabled={trigger_saving}
                >
                  {trigger_saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save trigger
                </Button>
              </section>
            </>
          ) : selected_node ? (
            <section
              key={selected_node.id}
              className="space-y-4 rounded-xl border border-border bg-card p-4"
            >
              <header className="flex items-start gap-2.5">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-subtle"
                  style={{ color: selected_node.data.color }}
                >
                  <DynamicIcon name={selected_node.data.icon} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">
                    {selected_node.data.name}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    {selected_node.data.type} · {selected_node.data.key}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Delete step"
                  onClick={() => void delete_selected()}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </header>

              <FieldShell label="Name">
                <Input
                  value={selected_node.data.name}
                  onChange={(event) =>
                    update_node(selected_node.id, { name: event.target.value })
                  }
                />
              </FieldShell>
              <FieldShell
                label="Key"
                hint="Letters, numbers and underscores. Used in templates."
              >
                <Input
                  value={selected_node.data.key}
                  onChange={(event) =>
                    update_node(selected_node.id, {
                      key: event.target.value
                        .replace(/[^a-z0-9_]/gi, "_")
                        .toLowerCase(),
                    })
                  }
                  className="font-mono"
                />
              </FieldShell>

              <div className="grid gap-3 border-t border-border pt-3">
                {(get_operation_definition(selected_node.data.type)?.fields ?? []).map(
                  (field) => (
                    <OptionField
                      key={field.name}
                      field={field}
                      value={selected_node.data.options[field.name]}
                      onChange={(value) =>
                        update_node(selected_node.id, {
                          options: {
                            ...selected_node.data.options,
                            [field.name]: value,
                          },
                        })
                      }
                      collections={data.collections}
                      flows={data.flows}
                    />
                  )
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    set_root_id(selected_node.id);
                    set_edges((current) => [
                      ...current.filter((edge) => edge.id !== ROOT_EDGE_ID),
                      root_edge(selected_node.id),
                    ]);
                    set_dirty(true);
                  }}
                >
                  <CircleDot className="size-3.5" /> Set as start step
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => set_palette_open(true)}
                >
                  <Plus className="size-3.5" /> Add next
                </Button>
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-border bg-card p-4">
            <header className="flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Runtime</h2>
            </header>
            <dl className="mt-3 grid gap-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Mode</dt>
                <dd className="font-mono">{data.runtime.mode}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Scheduler</dt>
                <dd>{data.runtime.scheduler ? "Embedded" : "External"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Last run</dt>
                <dd>{format_relative(current_flow.last_run_at)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Next run</dt>
                <dd>{format_datetime(current_flow.next_run_at)}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      <Dialog open={palette_open} onOpenChange={set_palette_open}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Workflow className="size-4" /> Add an operation
            </DialogTitle>
            <DialogDescription>
              The new step is connected to the selected step&apos;s resolve path
              when that path is free.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={palette_query}
            onChange={(event) => set_palette_query(event.target.value)}
            placeholder="Search operations"
            className="h-10"
            autoFocus
          />
          <div className="space-y-4">
            {OPERATION_GROUPS.map((group) => {
              const entries = filtered_operations.filter(
                (definition) => definition.group === group
              );
              if (entries.length === 0) return null;
              return (
                <div key={group}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {entries.map((definition) => (
                      <button
                        key={definition.type}
                        type="button"
                        onClick={() => add_operation(definition.type)}
                        className="flex gap-2.5 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/60"
                      >
                        <span
                          className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-subtle"
                          style={{ color: definition.color }}
                        >
                          <DynamicIcon name={definition.icon} size={15} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            {definition.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                            {definition.description}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={secret !== null}
        onOpenChange={(open) => {
          if (!open) set_secret(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your webhook secret</DialogTitle>
            <DialogDescription>
              This value is shown once. Send it in the{" "}
              <span className="font-mono">x-et-flow-secret</span> header or as a
              Bearer token.
            </DialogDescription>
          </DialogHeader>
          {secret ? (
            <div className="space-y-4">
              <div className="grid gap-1.5">
                <span className="text-xs font-semibold">Webhook URL</span>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={secret.url ?? ""}
                    className="h-10 font-mono text-xs"
                  />
                  <CopyButton value={secret.url ?? ""} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <span className="text-xs font-semibold">Secret</span>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={secret.secret}
                    className="h-10 font-mono text-xs"
                  />
                  <CopyButton value={secret.secret} />
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={logs_open}
        onOpenChange={(open) => {
          if (!open) {
            set_logs_open(false);
            set_run_detail(null);
          }
        }}
      >
        <DialogContent className="grid max-h-[90vh] grid-rows-[auto_minmax(0,1fr)] gap-4 sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-4" /> Activity &amp; logs · {flow.name}
            </DialogTitle>
          </DialogHeader>
          <div className="grid min-h-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="min-h-36 overflow-y-auto rounded-lg border border-border">
              {logs_loading ? (
                <div className="grid h-32 place-items-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : runs.length === 0 ? (
                <div className="grid h-32 place-items-center px-4 text-center text-sm text-muted-foreground">
                  No runs yet. Use Run or trigger the flow.
                </div>
              ) : (
                runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => void open_run_detail(run)}
                    className={cn(
                      "flex w-full flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 text-left text-xs last:border-b-0 hover:bg-muted/60",
                      run_detail?.run.id === run.id && "bg-muted"
                    )}
                  >
                    <RunStatusBadge status={run.status} />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {format_datetime(run.started_at)}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {format_duration(run.duration_ms)}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="min-h-0 overflow-y-auto rounded-lg border border-border p-3">
              {detail_loading ? (
                <div className="grid h-32 place-items-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : run_detail ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <RunStatusBadge status={run_detail.run.status} />
                    <span className="text-xs text-muted-foreground">
                      {format_datetime(run_detail.run.started_at)} ·{" "}
                      {format_duration(run_detail.run.duration_ms)}
                    </span>
                  </div>
                  {run_detail.run.error ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                      {run_detail.run.error}
                    </div>
                  ) : null}
                  {run_detail.steps.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No step details recorded.
                    </p>
                  ) : (
                    <ol className="space-y-2">
                      {run_detail.steps.map((step) => (
                        <li
                          key={step.id}
                          className="rounded-md border border-border bg-card p-2.5"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-semibold">
                              {step.key}
                            </span>
                            <Badge variant="outline">{step.type}</Badge>
                            <RunStatusBadge status={step.status} />
                            <span className="ml-auto tabular-nums text-muted-foreground">
                              {format_duration(step.duration_ms)}
                            </span>
                          </div>
                          {step.error ? (
                            <p className="mt-1 text-xs text-destructive">
                              {step.error}
                            </p>
                          ) : null}
                          <pre className="mt-2 max-h-32 overflow-auto rounded bg-surface-subtle p-2 text-[10px] leading-relaxed text-muted-foreground">
                            {JSON.stringify(step.output, null, 2)}
                          </pre>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Select a run to inspect each step.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function FlowBuilder({ data }: EtViewProps) {
  const builder = data as unknown as BuilderProps;
  return (
    <ReactFlowProvider>
      <BuilderCanvas data={builder} />
    </ReactFlowProvider>
  );
}
