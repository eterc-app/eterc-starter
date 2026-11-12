"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  History,
  LayoutGrid,
  Loader2,
  Lock,
  MoreHorizontal,
  MoreVertical,
  PanelRight,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Workflow,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import dagre from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
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
import {
  PageActionsPortal,
  usePageRightSidebar,
  useSetNavbarMeta,
} from "@/components/app/PageActionsSlot";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  RunStatusBadge,
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
  status?: string;
}

type BuilderNode = Node<BuilderNodeData>;

interface NodeActions {
  edit_mode: boolean;
  change_status: (status: "active" | "inactive") => void;
  edit_trigger: () => void;
  edit_operation: (id: string) => void;
  delete_operation: (id: string) => void;
  add_after: (source: string, handle: "resolve" | "reject") => void;
}

const NodeActionsContext = createContext<NodeActions | null>(null);

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

function node_text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function node_list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function short_text(value: unknown, max = 64): string {
  const text = node_text(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function compact_json(value: unknown): string {
  try {
    const text = JSON.stringify(value ?? {});
    return text && text !== "{}" ? short_text(text, 72) : "—";
  } catch {
    return "—";
  }
}

function response_label(value: unknown): string {
  return value === "all" ? "All data" : value === "other" ? "Other" : "Last operation";
}

function format_time(value: number): string {
  return new Date(value * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function trigger_details(
  trigger: FlowTrigger,
  options: Record<string, unknown>
): Array<{ label: string; value: string }> {
  if (trigger === "event") {
    const actions = node_list(options.actions);
    return [
      { label: "Type", value: options.type === "action" ? "Action" : "Filter" },
      {
        label: "Scope",
        value: actions.length ? actions.map((action) => `items.${action}`).join(", ") : "—",
      },
      { label: "Collections", value: node_list(options.collections).join(", ") || "—" },
    ];
  }
  if (trigger === "webhook") {
    return [
      { label: "Method", value: node_text(options.method ?? "POST") },
      { label: "Async", value: options.async === true ? "Enabled" : "Disabled" },
      { label: "Response", value: response_label(options.response_body) },
    ];
  }
  if (trigger === "schedule") {
    return [
      { label: "Interval", value: node_text(options.interval ?? "0 * * * *") },
      { label: "Timezone", value: "UTC" },
    ];
  }
  if (trigger === "manual") {
    return [
      { label: "Collections", value: node_list(options.collections).join(", ") || "—" },
      { label: "Location", value: node_list(options.location).join(", ") || "—" },
      { label: "Async", value: options.async === true ? "Enabled" : "Disabled" },
    ];
  }
  return [{ label: "Response", value: response_label(options.response_body) }];
}

function operation_details(
  type: string,
  options: Record<string, unknown>
): Array<{ label: string; value: string }> {
  switch (type) {
    case "condition":
      return [{ label: "Filter", value: compact_json(options.filter) }];
    case "item-read":
      return [
        { label: "Collection", value: node_text(options.collection) },
        { label: "Item key", value: short_text(options.key) },
      ];
    case "item-create": {
      const payload =
        options.payload && typeof options.payload === "object"
          ? Object.keys(options.payload as Record<string, unknown>)
          : [];
      return [
        { label: "Collection", value: node_text(options.collection) },
        { label: "Payload", value: payload.length ? payload.join(", ") : "—" },
      ];
    }
    case "item-update":
      return [
        { label: "Collection", value: node_text(options.collection) },
        { label: "Item key", value: short_text(options.key) },
      ];
    case "item-delete":
      return [
        { label: "Collection", value: node_text(options.collection) },
        { label: "Item key", value: short_text(options.key) },
      ];
    case "request":
      return [
        { label: "URL", value: short_text(options.url) },
        { label: "Method", value: node_text(options.method ?? "GET") },
      ];
    case "trigger":
      return [
        { label: "Flow", value: short_text(options.flow_id, 20) },
        { label: "Response", value: response_label(options.response_body) },
      ];
    case "transform": {
      const keys =
        options.json && typeof options.json === "object"
          ? Object.keys(options.json as Record<string, unknown>)
          : [];
      return [{ label: "Output", value: keys.length ? keys.join(", ") : "—" }];
    }
    case "log":
      return [
        { label: "Message", value: short_text(options.message) },
        { label: "Level", value: node_text(options.level ?? "info") },
      ];
    case "sleep":
      return [
        {
          label: "Duration",
          value: `${Number(options.milliseconds) || 1000} ms`,
        },
      ];
    case "throw-error":
      return [{ label: "Message", value: short_text(options.message) }];
    default:
      return [];
  }
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
      color: definition?.color ?? "var(--muted-foreground)",
      resolve: operation.resolve,
      reject: operation.reject,
    },
  };
}

function trigger_node(
  trigger: FlowTrigger,
  x: number,
  y: number,
  options: Record<string, unknown>,
  status: string
): BuilderNode {
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
      options,
      icon: definition?.icon ?? "zap",
      color: definition?.color ?? "var(--primary)",
      resolve: null,
      reject: null,
      status,
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
      stroke: handle === "reject" ? "var(--filter-or)" : "var(--foreground)",
    },
    labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
    labelBgStyle: { fill: "var(--card)" },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: handle === "reject" ? "var(--filter-or)" : "var(--foreground)",
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
    graph.setNode(node.id, { width: 300, height: 190 });
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
      position: { x: position.x - 150, y: position.y - 95 },
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

const FlowNodeCard = ({ id, data, selected }: NodeProps<BuilderNode>) => {
  const actions = useContext(NodeActionsContext);
  const is_trigger = data.kind === "trigger";
  const definition = is_trigger ? null : get_operation_definition(data.type);
  const header = is_trigger ? "Trigger" : definition?.label ?? data.type;
  const subtitle = is_trigger
    ? TRIGGER_LABELS[data.type as FlowTrigger]
    : data.name;
  const details = is_trigger
    ? trigger_details(data.type as FlowTrigger, data.options)
    : operation_details(data.type, data.options);
  const status = data.status === "active" ? "Active" : "Inactive";

  const stop_pointer = (event: React.PointerEvent) => {
    event.stopPropagation();
  };

  return (
    <div
      className={cn(
        "flow-card relative w-[300px] rounded-xl border text-left transition-colors",
        is_trigger ? "bg-surface-subtle" : "bg-card",
        selected ? "flow-card-selected border-foreground" : "border-border"
      )}
    >
      {!is_trigger ? (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          className="!size-4 !border-2 !border-foreground !bg-card"
        />
      ) : null}

      <div className="flex items-start gap-2.5 px-4 pb-3 pt-3.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-foreground">
          <DynamicIcon name={data.icon} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{header}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions?.edit_mode ? (
            <button
              type="button"
              title={is_trigger ? "Edit flow and trigger" : "Edit step"}
              aria-label={is_trigger ? "Edit flow and trigger" : "Edit step"}
              className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onPointerDown={stop_pointer}
              onClick={(event) => {
                event.stopPropagation();
                if (is_trigger) actions.edit_trigger();
                else actions.edit_operation(id);
              }}
            >
              <Pencil className="size-3.5" />
            </button>
          ) : null}
          {!is_trigger && actions?.edit_mode ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Step actions"
                  aria-label="Step actions"
                  className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onPointerDown={stop_pointer}
                >
                  <MoreVertical className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onSelect={() => actions?.edit_operation(id)}
                >
                  <Pencil />
                  Edit step
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => actions?.delete_operation(id)}
                >
                  <Trash2 />
                  Delete step
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {details.length > 0 ? (
        <div className="grid gap-2 border-t border-border px-4 py-3">
          {details.map((detail) => (
            <div key={detail.label} className="grid gap-0.5">
              <span className="text-xs font-semibold text-foreground">
                {detail.label}
              </span>
              <span
                className="line-clamp-2 text-xs text-muted-foreground"
                title={detail.value}
              >
                {detail.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {is_trigger ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground"
                onPointerDown={stop_pointer}
                title="Change flow status"
                aria-label="Change flow status"
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    data.status === "active"
                      ? "bg-foreground"
                      : "bg-muted-foreground"
                  )}
                />
                {status}
                <ChevronDown className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              <DropdownMenuItem onSelect={() => actions?.change_status("active")}>
                Active
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions?.change_status("inactive")}>
                Inactive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <div className="relative h-12 border-t border-border" />
      )}

      {is_trigger ? (
        <Handle
          type="source"
          position={Position.Right}
          id="root"
          className="!top-1/2 !size-4 !border-2 !border-foreground !bg-card"
        />
      ) : (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="resolve"
            className="!top-[74%] !size-5 !border-0 !bg-foreground !text-background"
          >
            <Check className="pointer-events-none size-3" />
          </Handle>
          <Handle
            type="source"
            position={Position.Right}
            id="reject"
            className="!top-[88%] !size-5 !border-0 !bg-filter-or !text-background"
          >
            <X className="pointer-events-none size-3" />
          </Handle>

          <div className="absolute left-full top-[74%] ml-1 flex -translate-y-1/2 items-center gap-1">
            <span className="h-0.5 w-5 bg-foreground" />
            <button
              type="button"
              title="Add a step after resolve"
              aria-label="Add a step after resolve"
              className="grid size-5 place-items-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
              onPointerDown={stop_pointer}
              onClick={(event) => {
                event.stopPropagation();
                actions?.add_after(id, "resolve");
              }}
            >
              <Plus className="size-3" />
            </button>
          </div>
          <div className="absolute left-full top-[88%] ml-1 flex -translate-y-1/2 items-center gap-1">
            <span className="h-0.5 w-5 bg-filter-or" />
            <button
              type="button"
              title="Add a step after reject"
              aria-label="Add a step after reject"
              className="grid size-5 place-items-center rounded-full border border-filter-or bg-card text-filter-or transition-transform hover:scale-105"
              onPointerDown={stop_pointer}
              onClick={(event) => {
                event.stopPropagation();
                actions?.add_after(id, "reject");
              }}
            >
              <Plus className="size-3" />
            </button>
          </div>
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
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {children}
      {hint ? (
        <span className="text-xs leading-snug text-muted-foreground">
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
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
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
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
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

function CollectionPicker({
  collections,
  is_checked,
  on_toggle,
}: {
  collections: CollectionOption[];
  is_checked: (name: string) => boolean;
  on_toggle: (name: string) => void;
}) {
  const [expanded, set_expanded] = useState(false);
  const visible = expanded ? collections : collections.slice(0, 8);
  const remaining = collections.length - visible.length;

  return (
    <div className="grid gap-2">
      <div className="grid gap-1">
        {collections.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface-subtle p-3 text-xs text-muted-foreground">
            No collections yet.
          </p>
        ) : (
          visible.map((collection) => (
            <label
              key={collection.name}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted/40"
            >
              <Checkbox
                checked={is_checked(collection.name)}
                onCheckedChange={() => on_toggle(collection.name)}
              />
              <span className="min-w-0 truncate">{collection.label}</span>
            </label>
          ))
        )}
      </div>
      {collections.length > 8 ? (
        <button
          type="button"
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => set_expanded((current) => !current)}
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
          />
          {expanded ? "Show less" : `Show ${remaining} more`}
        </button>
      ) : null}
    </div>
  );
}

function HeadersField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: Record<string, string>) => void;
}) {
  const initial = useMemo(() => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.entries(value as Record<string, unknown>).map(([key, entry]) => ({
      key,
      value: String(entry ?? ""),
    }));
  }, [value]);
  const [rows, set_rows] = useState(initial);

  const commit = (next: Array<{ key: string; value: string }>) => {
    set_rows(next);
    const output: Record<string, string> = {};
    for (const row of next) {
      const key = row.key.trim();
      if (key) output[key] = row.value;
    }
    onChange(output);
  };

  return (
    <div className="grid gap-2">
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No headers yet.</p>
      ) : null}
      {rows.map((row, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-2"
        >
          <Input
            value={row.key}
            onChange={(event) =>
              commit(
                rows.map((entry, entry_index) =>
                  entry_index === index ? { ...entry, key: event.target.value } : entry
                )
              )
            }
            placeholder="Header"
            className="h-10 font-mono text-xs"
          />
          <Input
            value={row.value}
            onChange={(event) =>
              commit(
                rows.map((entry, entry_index) =>
                  entry_index === index
                    ? { ...entry, value: event.target.value }
                    : entry
                )
              )
            }
            placeholder="Value"
            className="h-10 text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Remove header"
            aria-label="Remove header"
            onClick={() => commit(rows.filter((_, entry_index) => entry_index !== index))}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      ))}
      <button
        type="button"
        className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
        onClick={() => commit([...rows, { key: "", value: "" }])}
      >
        <Plus className="size-3.5" />
        Create New
      </button>
    </div>
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
  const { collapsed: right_sidebar_collapsed, setCollapsed: set_right_sidebar_collapsed } =
    usePageRightSidebar();

  const initial_root = useMemo(() => root_of(flow), [flow]);
  const [nodes, set_nodes] = useState<BuilderNode[]>(() => {
    const operations = flow.operations.map(operation_node);
    if (operations.length === 0) {
      return [
        trigger_node(flow.trigger, 40, 160, flow.options, flow.status),
      ];
    }
    const root = operations.find((node) => node.id === initial_root) ?? operations[0];
    const trigger_x = root.position.x - 380;
    return [
      trigger_node(flow.trigger, trigger_x, root.position.y, flow.options, flow.status),
      ...operations,
    ];
  });
  const [edges, set_edges] = useState<Edge[]>(() =>
    build_edges(flow.operations, initial_root)
  );
  const [root_id, set_root_id] = useState<string | null>(initial_root);
  const [selected_id, set_selected_id] = useState<string | null>(null);
  const [inspector_open, set_inspector_open] = useState(false);
  const [edit_mode, set_edit_mode] = useState(false);
  const [editor_tab, set_editor_tab] = useState<"flow" | "trigger">("flow");
  const [add_target, set_add_target] = useState<{
    source: string;
    handle: "resolve" | "reject";
  } | null>(null);
  const [logs_failed_only, set_logs_failed_only] = useState(false);
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
  const [editor_saving, set_editor_saving] = useState(false);
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
      const key = unique_key(type, nodes);
      const selected = nodes.find((node) => node.id === selected_id);
      const anchor = add_target
        ? nodes.find((node) => node.id === add_target.source)
        : selected;
      const base_x = anchor ? anchor.position.x + 380 : 440;
      const base_y = anchor
        ? anchor.position.y + nodes.length * 6
        : 140 + nodes.length * 24;
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

      let connect_source: string | null = null;
      let connect_handle: "root" | "resolve" | "reject" = "resolve";
      if (add_target) {
        connect_source = add_target.source;
        connect_handle =
          add_target.source === TRIGGER_NODE_ID ? "root" : add_target.handle;
      } else if (
        selected &&
        selected.data.kind === "operation" &&
        !selected.data.resolve
      ) {
        connect_source = selected.id;
        connect_handle = "resolve";
      } else if (!root_id) {
        connect_source = TRIGGER_NODE_ID;
        connect_handle = "root";
      }

      set_nodes((current) =>
        [
          ...current.map((node) => {
            const base = { ...node, selected: false };
            if (
              connect_source &&
              node.id === connect_source &&
              connect_handle !== "root"
            ) {
              return {
                ...base,
                data: { ...node.data, [connect_handle]: id },
              };
            }
            return base;
          }),
          { ...next, selected: true },
        ] as BuilderNode[]
      );

      if (connect_source === TRIGGER_NODE_ID) {
        set_root_id(id);
        set_edges((current) => [
          ...current.filter((edge) => edge.id !== ROOT_EDGE_ID),
          root_edge(id),
        ]);
      } else if (connect_source) {
        set_edges((current) => [
          ...current.filter(
            (edge) =>
              !(
                edge.source === connect_source &&
                edge.sourceHandle === connect_handle
              )
          ),
          operation_edge(connect_source, connect_handle as "resolve" | "reject", id),
        ]);
      }

      set_selected_id(id);
      set_add_target(null);
      set_inspector_open(true);
      set_edit_mode(true);
      set_palette_open(false);
      set_palette_query("");
      set_dirty(true);
      window.setTimeout(() => {
        void fitView({ padding: 0.24, duration: 250, maxZoom: 1 });
      }, 120);
    },
    [add_target, fitView, nodes, root_id, selected_id]
  );

  const delete_operation = useCallback(
    async (id: string) => {
      const node = nodes.find((entry) => entry.id === id);
      if (!node || node.data.kind === "trigger") return;
      const approved = await confirm({
        title: "Delete this step?",
        description: (
          <>
            <span className="font-semibold">{node.data.name}</span> will be
            removed and its links cleared.
          </>
        ),
        confirmLabel: "Delete step",
        tone: "destructive",
      });
      if (!approved) return;
      set_nodes((current) => current.filter((entry) => entry.id !== id));
      set_edges((current) =>
        current.filter((edge) => edge.source !== id && edge.target !== id)
      );
      if (root_id === id) set_root_id(null);
      set_selected_id(null);
      set_inspector_open(false);
      set_add_target(null);
      set_dirty(true);
    },
    [confirm, nodes, root_id]
  );

  const delete_selected = useCallback(async () => {
    if (!selected_node) return;
    await delete_operation(selected_node.id);
  }, [delete_operation, selected_node]);

  const tidy = useCallback(() => {
    set_nodes((current) => layout_graph(current, edges));
    set_dirty(true);
    window.setTimeout(() => {
      void fitView({ padding: 0.24, duration: 300, maxZoom: 1 });
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
      set_nodes((current) =>
        current.map((node) =>
          node.id === TRIGGER_NODE_ID
            ? { ...node, data: { ...node.data, icon, color } }
            : node
        )
      );
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
      set_nodes((current) =>
        current.map((node) =>
          node.id === TRIGGER_NODE_ID
            ? { ...node, data: { ...node.data, options: { ...result.flow.options } } }
            : node
        )
      );
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

  const save_editor = useCallback(async () => {
    set_editor_saving(true);
    try {
      if (selected_node && selected_node.data.kind === "operation") {
        await save_graph();
      } else {
        await save_meta();
        await save_trigger();
      }
      set_inspector_open(false);
      set_edit_mode(false);
    } finally {
      set_editor_saving(false);
    }
  }, [save_graph, save_meta, save_trigger, selected_node]);

  const change_status = useCallback(
    async (next: "active" | "inactive") => {
      set_activating(true);
      try {
        const result = await flows_call<{ flow: FlowRecord }>("set_status", {
          id: flow.id,
          status: next,
        });
        set_current_flow(result.flow);
        set_nodes((current) =>
          current.map((node) =>
            node.id === TRIGGER_NODE_ID
              ? { ...node, data: { ...node.data, status: result.flow.status } }
              : node
          )
        );
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
    },
    [flow.id]
  );

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
    set_inspector_open(false);
    set_edit_mode(false);
    set_run_detail(null);
    void load_runs();
  }, [load_runs]);

  const open_editor = useCallback(
    (tab: "flow" | "trigger", operationId: string | null = null) => {
      set_logs_open(false);
      set_edit_mode(true);
      set_editor_tab(tab);
      set_selected_id(operationId);
      set_inspector_open(true);
    },
    []
  );

  const toggle_edit_mode = useCallback(() => {
    if (edit_mode) {
      set_edit_mode(false);
      set_inspector_open(false);
      return;
    }
    set_edit_mode(true);
    set_logs_open(false);
  }, [edit_mode]);

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

  const delete_flow_action = useCallback(async () => {
    const approved = await confirm({
      title: "Delete this flow?",
      description: (
        <>
          <span className="font-semibold">{current_flow.name}</span> and its run
          history will be deleted. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete flow",
      tone: "destructive",
    });
    if (!approved) return;
    try {
      await flows_call("delete_flow", { id: flow.id });
      window.location.href = "/admin/flows";
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete the flow."
      );
    }
  }, [confirm, current_flow.name, flow.id]);

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
  const selected_definition = selected_node
    ? get_operation_definition(selected_node.data.type)
    : null;
  const selected_fields = selected_definition?.fields ?? [];
  const render_operation_field = (field: FlowFieldDefinition) => {
    if (!selected_node) return null;
    if (selected_node.data.type === "request" && field.name === "headers") {
      return (
        <FieldShell key={field.name} label="Headers">
          <HeadersField
            key={selected_node.id}
            value={selected_node.data.options.headers}
            onChange={(value) =>
              update_node(selected_node.id, {
                options: {
                  ...selected_node.data.options,
                  headers: value,
                },
              })
            }
          />
        </FieldShell>
      );
    }
    return (
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
    );
  };
  const event_scope_value = (() => {
    const actions = Array.isArray(trigger_options.actions)
      ? trigger_options.actions
      : [];
    const first = String(actions[0] ?? "create");
    return first.startsWith("items.") ? first : `items.${first}`;
  })();
  const visible_runs = useMemo(() => {
    if (!logs_failed_only) return runs;
    return runs.filter(
      (run) =>
        run.status === "error" ||
        run.status === "timeout" ||
        run.status === "rejected"
    );
  }, [logs_failed_only, runs]);
  const run_groups = useMemo(() => {
    const groups = new Map<string, FlowRunRecord[]>();
    for (const run of visible_runs) {
      const key = new Date(run.started_at * 1000).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      const list = groups.get(key) ?? [];
      list.push(run);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [visible_runs]);
  const node_actions = useMemo<NodeActions>(
    () => ({
      edit_mode,
      change_status: (status) => void change_status(status),
      edit_trigger: () => open_editor("trigger"),
      edit_operation: (id) => open_editor("trigger", id),
      delete_operation: (id) => void delete_operation(id),
      add_after: (source, handle) => {
        set_add_target({ source, handle });
        set_palette_open(true);
        set_palette_query("");
      },
    }),
    [change_status, delete_operation, edit_mode, open_editor]
  );
  const router = useRouter();
  const navbar_meta = useMemo(
    () => ({
      section: "Flows",
      title: current_flow.name,
      onBack: () => router.push("/admin/flows"),
      icon: <DynamicIcon name={icon} size={16} />,
      badge: dirty ? (
        <span
          className="ml-1 inline-block size-2 rounded-full bg-foreground"
          title="Unsaved changes"
          aria-label="Unsaved changes"
        />
      ) : undefined,
    }),
    [current_flow.name, dirty, icon, router]
  );
  useSetNavbarMeta(navbar_meta);

  return (
    <NodeActionsContext.Provider value={node_actions}>
    <div className="space-y-4">
      {confirm_dialog}

      <PageActionsPortal>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Run now"
          aria-label="Run now"
          onClick={() => void run_now()}
          disabled={running}
        >
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
        </Button>
        <Button
          variant={logs_open ? "outline" : "ghost"}
          size="icon-sm"
          title="Activity & logs"
          aria-label="Activity & logs"
          onClick={open_logs}
        >
          <History className="size-3.5" />
        </Button>
        <Button
          variant={edit_mode ? "outline" : "ghost"}
          size="icon-sm"
          title="Edit flow"
          aria-label="Edit flow"
          aria-pressed={edit_mode}
          onClick={toggle_edit_mode}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          title="Save graph"
          aria-label="Save graph"
          onClick={() => void save_graph()}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Delete flow"
          aria-label="Delete flow"
          onClick={() => void delete_flow_action()}
        >
          <Trash2 className="size-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              title="More flow actions"
              aria-label="More flow actions"
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => void export_flow()}>
              <Download />
              Export flow
            </DropdownMenuItem>
            {flow.trigger === "webhook" ? (
              <DropdownMenuItem onSelect={() => void rotate_secret()}>
                <Lock />
                Rotate secret
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => void delete_flow_action()}
            >
              <Trash2 />
              Delete flow
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Toggle right panel"
          aria-label="Toggle right panel"
          aria-pressed={!right_sidebar_collapsed}
          onClick={() => set_right_sidebar_collapsed(!right_sidebar_collapsed)}
        >
          <PanelRight className="size-3.5" />
        </Button>
      </PageActionsPortal>

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

      <div className="relative">
        <div className="relative h-[calc(100dvh-8.5rem)] min-h-[560px] w-full overflow-hidden rounded-xl border border-border bg-background">
          <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card p-1.5">
            <Button
              size="sm"
              onClick={() => {
                set_add_target(null);
                set_palette_open(true);
              }}
            >
              <Plus className="size-3.5" /> Add step
            </Button>
            <Button variant="ghost" size="sm" onClick={tidy}>
              <LayoutGrid className="size-3.5" /> Tidy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void fitView({ padding: 0.24, duration: 300, maxZoom: 1 })
              }
            >
              <RefreshCw className="size-3.5" /> Fit
            </Button>
            <span className="hidden px-2 text-xs text-muted-foreground 2xl:inline">
              Drag from a check for resolve, an X for reject.
            </span>
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={on_nodes_change}
            onEdgesChange={on_edges_change}
            onEdgesDelete={on_edges_delete}
            onConnect={on_connect}
            onSelectionChange={({ nodes: selected }) => {
              set_selected_id(selected[0]?.id ?? null);
            }}
            onPaneClick={() => {
              set_selected_id(null);
              set_inspector_open(false);
            }}
            fitView
            fitViewOptions={{ padding: 0.24, maxZoom: 1 }}
            proOptions={{ hideAttribution: false }}
            className="bg-background"
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: { type: MarkerType.ArrowClosed },
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="var(--border)"
            />
          </ReactFlow>
        </div>

        {inspector_open ? (
          <>
            <button
              type="button"
              aria-label="Close flow editor"
              className="fixed inset-x-0 bottom-0 top-12 z-40 cursor-default bg-overlay/20 sm:top-14"
              onClick={() => {
                set_inspector_open(false);
                set_edit_mode(false);
              }}
            />
            <aside className="flow-panel fixed bottom-0 right-0 top-12 z-50 flex w-full max-w-[480px] flex-col border-l border-border bg-card sm:top-14">
              <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
                <span className="grid size-8 place-items-center rounded-full border border-border bg-surface-subtle text-muted-foreground">
                  {inspector_is_trigger ? (
                    <Sparkles className="size-4" />
                  ) : (
                    <Pencil className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {inspector_is_trigger ? "Updating Flow" : "Edit Operation"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {current_flow.name}
                  </p>
                </div>
                <Button
                  size="icon-sm"
                  title="Save and close"
                  aria-label="Save and close"
                  onClick={() => void save_editor()}
                  disabled={editor_saving || meta_saving || trigger_saving}
                >
                  {editor_saving || meta_saving || trigger_saving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Close editor"
                  aria-label="Close editor"
                  onClick={() => {
                    set_inspector_open(false);
                    set_edit_mode(false);
                  }}
                >
                  <X className="size-3.5" />
                </Button>
              </header>
              <div className="flex min-h-0 flex-1">
                {inspector_is_trigger ? (
                  <aside className="w-40 shrink-0 border-r border-border bg-surface-subtle p-2">
                    <nav className="space-y-1" aria-label="Flow editor sections">
                      {[
                        { id: "flow" as const, label: "Flow Setup" },
                        { id: "trigger" as const, label: "Trigger Setup" },
                      ].map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => set_editor_tab(entry.id)}
                          className={cn(
                            "flex h-9 w-full items-center rounded-lg px-3 text-left text-sm font-medium transition-colors",
                            editor_tab === entry.id
                              ? "border border-border bg-card text-foreground"
                              : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                          )}
                        >
                          {entry.label}
                        </button>
                      ))}
                    </nav>
                  </aside>
                ) : null}
                <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          {inspector_is_trigger ? (
            <>
              {editor_tab === "flow" ? (
              <section className="space-y-4">
                <header className="flex items-center gap-2">
                  <Zap className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Flow setup</h2>
                </header>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldShell label="Name *">
                    <Input
                      value={name}
                      onChange={(event) => set_name(event.target.value)}
                    />
                  </FieldShell>
                  <FieldShell label="Status">
                    <Select
                      value={current_flow.status}
                      onValueChange={(value) =>
                        void change_status(value as "active" | "inactive")
                      }
                      disabled={activating}
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldShell>
                </div>
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
              </section>
              ) : null}

              {editor_tab === "trigger" ? (
              <section className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-subtle p-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground">
                    <DynamicIcon
                      name={trigger_definition?.icon ?? "zap"}
                      size={16}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {trigger_definition?.label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {trigger_definition?.description}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Close editor"
                    aria-label="Close editor"
                    onClick={() => {
                      set_inspector_open(false);
                      set_edit_mode(false);
                    }}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>

                {flow.trigger === "event" ? (
                  <>
                    <FieldShell label="Type *">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          {
                            value: "filter" as const,
                            title: "Filter (Blocking)",
                            body: "Runs before the write and can block it.",
                          },
                          {
                            value: "action" as const,
                            title: "Action (Non-Blocking)",
                            body: "Runs after the write, without slowing the request.",
                          },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              set_trigger_options((current) => ({
                                ...current,
                                type: option.value,
                              }))
                            }
                            className={cn(
                              "rounded-lg border p-3 text-left text-sm transition-colors",
                              trigger_options.type === option.value
                                ? "border-foreground bg-surface-subtle"
                                : "border-border bg-card hover:bg-muted/40"
                            )}
                          >
                            <span className="block font-medium">{option.title}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {option.body}
                            </span>
                          </button>
                        ))}
                      </div>
                    </FieldShell>
                    <FieldShell
                      label="Scope *"
                      hint="The hook runs for this item event."
                    >
                      <Select
                        value={event_scope_value}
                        onValueChange={(value) =>
                          set_trigger_options((current) => ({
                            ...current,
                            actions: [value.replace(/^items\./, "")],
                          }))
                        }
                      >
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="items.create">items.create</SelectItem>
                          <SelectItem value="items.update">items.update</SelectItem>
                          <SelectItem value="items.delete">items.delete</SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldShell>
                    <FieldShell label="Collections *">
                      <CollectionPicker
                        collections={data.collections}
                        is_checked={(name) => check_option("collections", name)}
                        on_toggle={(name) => toggle_option("collections", name)}
                      />
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
                            <span className="mt-0.5 block text-xs text-muted-foreground">
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
                            className="h-10 font-mono text-xs"
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
                            <span className="font-mono text-xs text-muted-foreground">
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
                          className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
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
                      <CollectionPicker
                        collections={data.collections}
                        is_checked={(name) => check_option("collections", name)}
                        on_toggle={(name) => toggle_option("collections", name)}
                      />
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
                            <span className="mt-0.5 block text-xs text-muted-foreground">
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
              </section>
              ) : null}
            </>
          ) : selected_node ? (
            <section
              key={selected_node.id}
              className="space-y-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
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
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-subtle p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-foreground">
                  <DynamicIcon name={selected_node.data.icon} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {get_operation_definition(selected_node.data.type)?.label ??
                      selected_node.data.type}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {get_operation_definition(selected_node.data.type)?.description}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Remove step"
                  aria-label="Remove step"
                  onClick={() => void delete_selected()}
                >
                  <X className="size-3.5" />
                </Button>
              </div>

              <div className="grid gap-3 border-t border-border pt-3">
                {selected_node.data.type === "request" ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                      {["method", "url"].map((name) => {
                        const field = selected_fields.find(
                          (entry) => entry.name === name
                        );
                        return field ? render_operation_field(field) : null;
                      })}
                    </div>
                    {["headers", "body", "timeout_ms"].map((name) => {
                      const field = selected_fields.find(
                        (entry) => entry.name === name
                      );
                      return field ? render_operation_field(field) : null;
                    })}
                  </>
                ) : (
                  selected_fields.map(render_operation_field)
                )}
              </div>

            </section>
          ) : null}

                </div>
              </div>
            </aside>
          </>
        ) : null}
      </div>

      {logs_open ? (
        <aside className="flow-panel fixed bottom-0 right-0 top-12 z-50 flex w-full max-w-[300px] flex-col border-l border-border bg-card sm:top-14">
          <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">Logs</p>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Close logs"
              aria-label="Close logs"
              onClick={() => set_logs_open(false)}
            >
              <X className="size-3.5" />
            </Button>
          </header>

          {detail_loading ? (
            <div className="grid flex-1 place-items-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : run_detail ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Back to logs"
                  aria-label="Back to logs"
                  onClick={() => set_run_detail(null)}
                >
                  <ArrowLeft className="size-3.5" />
                </Button>
                <RunStatusBadge status={run_detail.run.status} />
                <span className="truncate text-xs text-muted-foreground">
                  {format_datetime(run_detail.run.started_at)}
                </span>
              </div>
              <div className="app-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
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
                  run_detail.steps.map((step) => (
                    <div
                      key={step.id}
                      className="rounded-md border border-border bg-card p-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-semibold">{step.key}</span>
                        <RunStatusBadge status={step.status} />
                        <span className="ml-auto tabular-nums text-muted-foreground">
                          {format_duration(step.duration_ms)}
                        </span>
                      </div>
                      {step.error ? (
                        <p className="mt-1 text-xs text-destructive">{step.error}</p>
                      ) : null}
                      <pre className="mt-2 max-h-28 overflow-auto rounded bg-surface-subtle p-2 text-xs leading-relaxed text-muted-foreground">
                        {JSON.stringify(step.output, null, 2)}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-border px-4 py-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={logs_failed_only}
                    onCheckedChange={(value) => set_logs_failed_only(value === true)}
                  />
                  Show Failed Only
                </label>
              </div>
              <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto">
                {logs_loading ? (
                  <div className="grid h-24 place-items-center">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : run_groups.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground">
                    No runs yet. Use Run now or trigger the flow.
                  </p>
                ) : (
                  run_groups.map(([date, group]) => (
                    <div key={date}>
                      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-4 py-2 text-xs font-semibold text-muted-foreground">
                        <ChevronDown className="size-3.5" />
                        {date}
                      </div>
                      {group.map((run) => {
                        const failed =
                          run.status === "error" ||
                          run.status === "timeout" ||
                          run.status === "rejected";
                        return (
                          <button
                            key={run.id}
                            type="button"
                            onClick={() => void open_run_detail(run)}
                            className="flex w-full items-center gap-2 border-b border-border px-4 py-2 text-left text-xs transition-colors hover:bg-muted/40"
                          >
                            {failed ? (
                              <XCircle className="size-3.5 shrink-0 text-filter-or" />
                            ) : (
                              <CheckCircle2 className="size-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate text-foreground">
                              {format_time(run.started_at)}
                            </span>
                            <span className="ml-auto shrink-0 text-muted-foreground">
                              {format_relative(run.started_at)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          <button
            type="button"
            className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            onClick={() => set_logs_open(false)}
          >
            <Sparkles className="size-3.5" />
            AI Assistant
            <ChevronUp className="ml-auto size-3.5" />
          </button>
        </aside>
      ) : null}

      <Dialog open={palette_open} onOpenChange={set_palette_open}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Workflow className="size-4" /> Add an operation
            </DialogTitle>
            <DialogDescription>
              {add_target
                ? "The new step will be connected to the selected output."
                : "The new step is connected to the selected step's resolve path when that path is free."}
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
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
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

    </div>
    </NodeActionsContext.Provider>
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
