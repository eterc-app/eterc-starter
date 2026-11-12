"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownAZ,
  ArrowUp,
  ArrowUpAZ,
  AlertTriangle,
  Loader2,
  ListFilter,
  MoreVertical,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { EmptyState } from "@/components/app/EmptyState";
import { Notice } from "@/components/app/Notice";
import {
  PageActionsPortal,
  useSetNavbarMeta,
} from "@/components/app/PageActionsSlot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EtViewProps } from "@/engine/views-registry";
import type {
  FlowRecord,
  FlowRuntimeMode,
  FlowStatus,
  FlowTrigger,
} from "@/modules/flows/flow-types";
import { FLOW_STATUSES, FLOW_TRIGGERS, TRIGGER_LABELS } from "@/modules/flows/flow-types";
import { FlowWizard } from "./FlowWizard";
import {
  FlowIcon,
  flows_call,
} from "./flow-ui";

interface CollectionOption {
  name: string;
  label: string;
  primary_key: string;
}

interface FlowRow extends FlowRecord {
  webhook_url: string | null;
}

interface FlowHealth {
  ok: boolean;
  active: number;
  inactive: number;
  schedules: number;
  queue: { pending: number; running: number; failed: number };
  last_run_at: number | null;
}

interface ListPayload {
  flows: FlowRow[];
  runtime: FlowRuntimeMode;
  health: FlowHealth;
}

type FlowSortKey = "status" | "name" | "description";

interface FlowSort {
  key: FlowSortKey;
  direction: "asc" | "desc";
}

type FlowStatusFilter = "all" | FlowStatus;
type FlowTriggerFilter = "all" | FlowTrigger;

function is_one_of<T extends string>(
  value: string,
  options: readonly T[]
): value is T {
  return options.some((option) => option === value);
}

function flow_sort_value(
  flow: FlowRow,
  key: FlowSortKey
): string | number | null {
  switch (key) {
    case "status":
    case "name":
    case "description":
      return flow[key];
  }
}

function FlowTableHeader({
  label,
  sortKey,
  sort,
  onSort,
  filterActive = false,
  showFilter = false,
  children,
}: {
  label: string;
  sortKey: FlowSortKey;
  sort: FlowSort | null;
  onSort: (sort: FlowSort | null) => void;
  filterActive?: boolean;
  showFilter?: boolean;
  children?: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-inherit transition-colors hover:bg-muted"
          aria-label={`${label} column options`}
        >
          {label}
          {filterActive || showFilter ? (
            <ListFilter
              className={cn(
                "size-3",
                filterActive ? "text-primary" : "text-muted-foreground"
              )}
              aria-label={filterActive ? "Filtered" : "Filter options"}
            />
          ) : null}
          {sort?.key === sortKey ? (
            sort.direction === "asc" ? (
              <ArrowUpAZ className="size-3.5" />
            ) : (
              <ArrowDownAZ className="size-3.5" />
            )
          ) : (
            <ArrowUp className="size-3 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => onSort({ key: sortKey, direction: "asc" })}>
          <ArrowUpAZ />
          Sort Ascending
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSort({ key: sortKey, direction: "desc" })}>
          <ArrowDownAZ />
          Sort Descending
        </DropdownMenuItem>
        {sort?.key === sortKey ? (
          <DropdownMenuItem onSelect={() => onSort(null)}>
            Clear Sort
          </DropdownMenuItem>
        ) : null}
        {children ? (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FlowRowActions({
  flow,
  busy,
  onDeactivate,
  onEdit,
  onDelete,
}: {
  flow: FlowRow;
  busy: string | null;
  onDeactivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isBusy = busy === flow.id;

  return (
    <div className="flex w-full items-center justify-end gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            className="hover:bg-foreground/10 dark:hover:bg-muted/80"
            title="Flow actions"
            aria-label="Flow actions"
            disabled={isBusy}
          >
            {isBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MoreVertical className="size-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            disabled={flow.status === "inactive" || isBusy}
            onSelect={onDeactivate}
          >
            Set Flow to Inactive
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>
            Edit Flow
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 className="size-3.5" /> Delete Flow
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function FlowsList({ data }: EtViewProps) {
  const router = useRouter();
  const initial = data as unknown as ListPayload & {
    collections?: CollectionOption[];
  };
  const [payload, setPayload] = useState<ListPayload>({
    flows: initial.flows ?? [],
    runtime: initial.runtime,
    health: initial.health,
  });
  const [collections] = useState<CollectionOption[]>(initial.collections ?? []);
  const [statusFilter, setStatusFilter] = useState<FlowStatusFilter>("all");
  const [triggerFilter, setTriggerFilter] = useState<FlowTriggerFilter>("all");
  const [sort, setSort] = useState<FlowSort | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { confirm, dialog: confirm_dialog } = useConfirm();

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await flows_call<ListPayload>("list_state");
      setPayload(next);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not refresh flows."
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  const navbarMeta = useMemo(
    () => ({
      section: "Automation",
      title: "Flows",
      icon: <Zap className="size-4" strokeWidth={1.75} />,
      refresh: {
        label: "Refresh flows",
        onRefresh: () => void refresh(),
        busy: refreshing,
      },
    }),
    [refresh, refreshing]
  );
  useSetNavbarMeta(navbarMeta);

  const flows = useMemo(() => {
    const filtered = payload.flows.filter(
      (flow) =>
        (statusFilter === "all" || flow.status === statusFilter) &&
        (triggerFilter === "all" || flow.trigger === triggerFilter)
    );
    if (!sort) return filtered;

    return [...filtered].sort((first, second) => {
      const left = flow_sort_value(first, sort.key);
      const right = flow_sort_value(second, sort.key);
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      const result =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), undefined, {
              numeric: true,
              sensitivity: "base",
            });
      return sort.direction === "asc" ? result : -result;
    });
  }, [payload.flows, sort, statusFilter, triggerFilter]);

  const deactivateFlow = useCallback(
    async (flow: FlowRow) => {
      if (flow.status === "inactive") return;
      setBusy(flow.id);
      try {
        await flows_call("set_status", { id: flow.id, status: "inactive" });
        toast.success(`"${flow.name}" is now inactive.`);
        await refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not deactivate the flow."
        );
      } finally {
        setBusy(null);
      }
    },
    [refresh]
  );

  const deleteFlow = useCallback(
    async (flow: FlowRow) => {
      const approved = await confirm({
        title: "Delete this flow?",
        description: (
          <>
            <span className="font-semibold">{flow.name}</span> and its run
            history will be deleted. This cannot be undone.
          </>
        ),
        confirmLabel: "Delete flow",
        tone: "destructive",
      });
      if (!approved) return;
      setBusy(flow.id);
      try {
        await flows_call("delete_flow", { id: flow.id });
        toast.success(`Deleted "${flow.name}".`);
        await refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not delete the flow."
        );
      } finally {
        setBusy(null);
      }
    },
    [confirm, refresh]
  );

  const runtimeBlocked =
    !payload.runtime.enabled || payload.runtime.missing.length > 0;

  return (
    <div className="space-y-6">
      <PageActionsPortal>
        <Button
          size="icon"
          title="Create flow"
          aria-label="Create flow"
          onClick={() => setWizardOpen(true)}
        >
          <Plus className="size-4" />
        </Button>
      </PageActionsPortal>

      {runtimeBlocked ? (
        <Notice
          icon={AlertTriangle}
          tone={payload.runtime.enabled ? "warning" : "destructive"}
        >
          <p className="font-semibold">
            {payload.runtime.enabled
              ? "This runtime is not ready for flows."
              : "Flows are disabled."}
          </p>
          <p className="mt-1 text-xs">
            {payload.runtime.enabled
              ? `Missing: ${payload.runtime.missing.join(", ")}.`
              : "Set FLOWS_ENABLED=1 to turn the engine back on."}{" "}
            Current mode: <span className="font-mono">{payload.runtime.mode}</span>.
          </p>
        </Notice>
      ) : null}

      {flows.length === 0 ? (
        <EmptyState
          icon={<Zap className="size-5" strokeWidth={1.75} />}
          title={payload.flows.length === 0 ? "No flows yet" : "No matching flows"}
          description={
            payload.flows.length === 0
              ? "Create your first flow to react to content changes, webhooks or a schedule."
              : "No flows match the selected status and trigger filters."
          }
          action={
            payload.flows.length === 0 ? (
              <Button onClick={() => setWizardOpen(true)}>
                <Plus className="size-4" /> Create flow
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setStatusFilter("all");
                  setTriggerFilter("all");
                }}
              >
                Clear filters
              </Button>
            )
          }
        />
      ) : (
        <div className="app-scrollbar min-w-0 flex-1 overflow-auto">
          <table className="w-full min-w-[780px] table-fixed text-left text-sm">
            <thead className="sticky top-0 z-10 bg-transparent">
              <tr className="border-b border-border text-xs font-semibold text-foreground">
                <th className="w-10 border-r border-border px-2 py-2">
                  <span className="sr-only">Flow icon</span>
                </th>
                <th className="w-24 border-r border-border px-3 py-2">
                    <FlowTableHeader
                      label="Status"
                      sortKey="status"
                      sort={sort}
                      onSort={setSort}
                      filterActive={statusFilter !== "all"}
                      showFilter
                    >
                      <DropdownMenuLabel>Filter status</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={statusFilter}
                        onValueChange={(value) => {
                          if (value === "all" || is_one_of(value, FLOW_STATUSES)) {
                            setStatusFilter(value);
                          }
                        }}
                      >
                        <DropdownMenuRadioItem value="all">All statuses</DropdownMenuRadioItem>
                        {FLOW_STATUSES.map((status) => (
                          <DropdownMenuRadioItem key={status} value={status}>
                            {status === "active" ? "Active" : "Inactive"}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </FlowTableHeader>
                </th>
                <th className="w-60 border-r border-border px-3 py-2">
                    <FlowTableHeader
                      label="Name"
                      sortKey="name"
                      sort={sort}
                      onSort={setSort}
                      filterActive={triggerFilter !== "all"}
                    >
                      <DropdownMenuLabel>Filter trigger</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={triggerFilter}
                        onValueChange={(value) => {
                          if (value === "all" || is_one_of(value, FLOW_TRIGGERS)) {
                            setTriggerFilter(value);
                          }
                        }}
                      >
                        <DropdownMenuRadioItem value="all">All triggers</DropdownMenuRadioItem>
                        {FLOW_TRIGGERS.map((trigger) => (
                          <DropdownMenuRadioItem key={trigger} value={trigger}>
                            {TRIGGER_LABELS[trigger]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </FlowTableHeader>
                </th>
                <th className="w-[360px] px-3 py-2">
                    <FlowTableHeader
                      label="Description"
                      sortKey="description"
                      sort={sort}
                      onSort={setSort}
                    />
                </th>
                <th className="w-12 px-2 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {flows.map((flow) => (
                <tr
                  key={flow.id}
                  className="border-b border-border transition-colors last:border-b-0 hover:bg-foreground/10 dark:hover:bg-muted/80"
                >
                  <td className="px-2 py-2">
                    <FlowIcon
                      flow={flow}
                      className="mx-auto size-5 rounded-none border-0 bg-transparent"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={flow.status === "active" ? "default" : "outline"}
                      className={cn(
                        "h-7 rounded-full px-3 text-sm",
                        flow.status === "active" && "bg-foreground text-background"
                      )}
                    >
                      {flow.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/admin/flows/builder?id=${flow.id}`)
                      }
                      className="block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline"
                    >
                      {flow.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">
                    {flow.description || "--"}
                  </td>
                  <td className="w-12 px-2 py-2">
                    <FlowRowActions
                      flow={flow}
                      busy={busy}
                      onDeactivate={() => void deactivateFlow(flow)}
                      onEdit={() =>
                        router.push(`/admin/flows/builder?id=${flow.id}`)
                      }
                      onDelete={() => void deleteFlow(flow)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FlowWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        collections={collections}
        onCreated={(flow) => {
          router.push(`/admin/flows/builder?id=${flow.id}`);
        }}
      />

      {confirm_dialog}
    </div>
  );
}
