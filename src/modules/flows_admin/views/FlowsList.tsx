"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Filter,
  History,
  Loader2,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Webhook,
  XCircle,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EtViewProps } from "@/engine/views-registry";
import type {
  FlowRecord,
  FlowRunRecord,
  FlowRunStepRecord,
  FlowRuntimeMode,
} from "@/modules/flows/flow-types";
import { TRIGGER_LABELS } from "@/modules/flows/flow-types";
import { CopyButton } from "@/modules/cms_admin/views/ui";
import { FlowWizard } from "./FlowWizard";
import {
  FlowIcon,
  RunStatusBadge,
  flows_call,
  format_datetime,
  format_duration,
  format_relative,
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

interface RunDetail {
  run: FlowRunRecord;
  steps: FlowRunStepRecord[];
  flow: FlowRecord | null;
}

type StatusFilter = "all" | "active" | "inactive";

function FlowRowActions({
  flow,
  busy,
  onToggle,
  onRun,
  onDuplicate,
  onLogs,
  onDelete,
  onSecret,
}: {
  flow: FlowRow;
  busy: string | null;
  onToggle: () => void;
  onRun: () => void;
  onDuplicate: () => void;
  onLogs: () => void;
  onDelete: () => void;
  onSecret: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isBusy = busy === flow.id;

  return (
    <div className="relative flex items-center gap-1.5">
      <Button
        size="icon-sm"
        variant="ghost"
        title="Flow actions"
        aria-label="Flow actions"
        onClick={() => setOpen((current) => !current)}
        disabled={isBusy}
      >
        {isBusy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <MoreHorizontal className="size-4" />
        )}
      </Button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-9 z-40 w-52 overflow-hidden rounded-lg border border-border bg-popover py-1 text-sm">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
              onClick={() => {
                setOpen(false);
                onRun();
              }}
            >
              <Play className="size-3.5" /> Run now
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
              onClick={() => {
                setOpen(false);
                onLogs();
              }}
            >
              <History className="size-3.5" /> Activity &amp; logs
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
              onClick={() => {
                setOpen(false);
                onToggle();
              }}
            >
              {flow.status === "active" ? (
                <>
                  <XCircle className="size-3.5" /> Deactivate
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5" /> Activate
                </>
              )}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
              onClick={() => {
                setOpen(false);
                onDuplicate();
              }}
            >
              <Copy className="size-3.5" /> Duplicate
            </button>
            {flow.trigger === "webhook" ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  setOpen(false);
                  onSecret();
                }}
              >
                <Webhook className="size-3.5" /> Rotate secret
              </button>
            ) : null}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-destructive hover:bg-destructive/10"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        </>
      ) : null}
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [secretState, setSecretState] = useState<{
    flow: FlowRow;
    secret: string;
    url: string | null;
  } | null>(null);

  const [logsFlow, setLogsFlow] = useState<FlowRow | null>(null);
  const [runs, setRuns] = useState<FlowRunRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const { confirm, dialog: confirm_dialog } = useConfirm();

  useSetNavbarMeta({
    section: "Automation",
    title: "Flows",
    icon: <Zap className="size-4" strokeWidth={1.75} />,
  });

  const refresh = useCallback(async () => {
    try {
      const next = await flows_call<ListPayload>("list_state");
      setPayload(next);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not refresh flows."
      );
    }
  }, []);

  const flows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payload.flows.filter((flow) => {
      if (statusFilter !== "all" && flow.status !== statusFilter) return false;
      if (!term) return true;
      return (
        flow.name.toLowerCase().includes(term) ||
        flow.description.toLowerCase().includes(term) ||
        TRIGGER_LABELS[flow.trigger].toLowerCase().includes(term)
      );
    });
  }, [payload.flows, search, statusFilter]);

  const runAction = useCallback(
    async (flow: FlowRow, action: () => Promise<unknown>, success: string) => {
      setBusy(flow.id);
      try {
        await action();
        toast.success(success);
        await refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "The action failed."
        );
      } finally {
        setBusy(null);
      }
    },
    [refresh]
  );

  const toggleStatus = useCallback(
    (flow: FlowRow) =>
      runAction(
        flow,
        () =>
          flows_call("set_status", {
            id: flow.id,
            status: flow.status === "active" ? "inactive" : "active",
          }),
        flow.status === "active"
          ? `"${flow.name}" is now inactive.`
          : `"${flow.name}" is now active.`
      ),
    [runAction]
  );

  const runNow = useCallback(
    (flow: FlowRow) =>
      runAction(
        flow,
        async () => {
          const result = await flows_call<{
            status?: string;
            run_id?: string;
            queued?: boolean;
            error?: { message?: string } | null;
          }>("run_now", { id: flow.id, input: null, sync: true });
          if (result.queued) {
            toast.info("Run queued. It will start shortly.");
          } else if (result.status === "success") {
            toast.success("Flow ran successfully.");
          } else if (result.status === "rejected") {
            toast.warning(
              result.error?.message ?? "The flow rejected this run."
            );
          } else if (result.error?.message) {
            throw new Error(result.error.message);
          }
        },
        "Run finished."
      ),
    [runAction]
  );

  const duplicate = useCallback(
    (flow: FlowRow) =>
      runAction(
        flow,
        () => flows_call("duplicate_flow", { id: flow.id }),
        `Duplicated "${flow.name}". The copy is inactive.`
      ),
    [runAction]
  );

  const rotateSecret = useCallback(
    async (flow: FlowRow) => {
      setBusy(flow.id);
      try {
        const result = await flows_call<{
          flow: FlowRow;
          secret: string;
          webhook_url: string | null;
        }>("rotate_secret", { id: flow.id });
        setSecretState({
          flow: { ...flow, ...result.flow },
          secret: result.secret,
          url: result.webhook_url,
        });
        await refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not rotate the secret."
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

  const openLogs = useCallback(async (flow: FlowRow) => {
    setLogsFlow(flow);
    setRuns([]);
    setRunDetail(null);
    setLogsLoading(true);
    try {
      const result = await flows_call<{ runs: FlowRunRecord[] }>("runs", {
        flow_id: flow.id,
        limit: 30,
      });
      setRuns(result.runs);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load run logs."
      );
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const openRunDetail = useCallback(async (run: FlowRunRecord) => {
    setDetailLoading(true);
    setRunDetail(null);
    try {
      const result = await flows_call<RunDetail>("run_detail", { id: run.id });
      setRunDetail(result);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load the run."
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const runtimeBlocked =
    !payload.runtime.enabled || payload.runtime.missing.length > 0;

  return (
    <div className="space-y-6">
      <PageActionsPortal>
        <Button
          variant="ghost"
          size="icon"
          title="Refresh flows"
          aria-label="Refresh flows"
          onClick={() => void refresh()}
        >
          <RefreshCw className="size-4" />
        </Button>
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search flows"
            className="h-10 pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        >
          <SelectTrigger className="h-10 w-40">
            <Filter className="size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {flows.length === 0 ? (
        <EmptyState
          icon={<Zap className="size-5" strokeWidth={1.75} />}
          title={payload.flows.length === 0 ? "No flows yet" : "No matching flows"}
          description={
            payload.flows.length === 0
              ? "Create your first flow to react to content changes, webhooks or a schedule."
              : "Try a different search term or status filter."
          }
          action={
            payload.flows.length === 0 ? (
              <Button onClick={() => setWizardOpen(true)}>
                <Plus className="size-4" /> Create flow
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[190px_minmax(0,1.1fr)_minmax(0,1fr)_44px] items-center gap-4 border-b border-border bg-surface-subtle px-4 py-3 text-xs font-semibold text-muted-foreground md:grid">
            <span>Status</span>
            <span>Name</span>
            <span>Description</span>
            <span />
          </div>
          {flows.map((flow) => (
            <div
              key={flow.id}
              className="grid grid-cols-1 items-start gap-3 border-t border-border px-4 py-4 first:border-t-0 hover:bg-muted/30 md:grid-cols-[190px_minmax(0,1.1fr)_minmax(0,1fr)_44px] md:items-center"
            >
              <div className="flex items-center gap-2.5">
                <FlowIcon flow={flow} className="size-8" />
                <Badge
                  variant={flow.status === "active" ? "default" : "outline"}
                  className={cn(
                    "h-7 rounded-full px-3 text-xs",
                    flow.status === "active" &&
                      "bg-primary text-primary-foreground"
                  )}
                >
                  {flow.status === "active" ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/admin/flows/builder?id=${flow.id}`)
                  }
                  className="block max-w-full truncate text-left text-sm font-semibold hover:underline"
                >
                  {flow.name}
                </button>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{TRIGGER_LABELS[flow.trigger]}</span>
                  {flow.secret_prefix ? (
                    <span className="font-mono">{flow.secret_prefix}…</span>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0">
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {flow.description || "—"}
                </p>
                <p
                  className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground"
                  suppressHydrationWarning
                >
                  <span>Updated {format_relative(flow.updated_at)}</span>
                  <span>Last run {format_relative(flow.last_run_at)}</span>
                  {flow.trigger === "schedule" && flow.next_run_at ? (
                    <span>Next {format_datetime(flow.next_run_at)}</span>
                  ) : null}
                </p>
              </div>

              <div className="flex justify-end">
                <FlowRowActions
                  flow={flow}
                  busy={busy}
                  onToggle={() => void toggleStatus(flow)}
                  onRun={() => void runNow(flow)}
                  onDuplicate={() => void duplicate(flow)}
                  onLogs={() => void openLogs(flow)}
                  onDelete={() => void deleteFlow(flow)}
                  onSecret={() => void rotateSecret(flow)}
                />
              </div>
            </div>
          ))}
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

      <Dialog
        open={secretState !== null}
        onOpenChange={(open) => {
          if (!open) setSecretState(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook secret rotated</DialogTitle>
            <DialogDescription>
              Copy this secret now. Only its hash is stored and it cannot be
              shown again.
            </DialogDescription>
          </DialogHeader>
          {secretState ? (
            <div className="space-y-4">
              <div className="grid gap-1.5">
                <span className="text-xs font-semibold">Webhook URL</span>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={secretState.url ?? ""}
                    className="h-10 font-mono text-xs"
                  />
                  <CopyButton value={secretState.url ?? ""} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <span className="text-xs font-semibold">Secret</span>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={secretState.secret}
                    className="h-10 font-mono text-xs"
                  />
                  <CopyButton value={secretState.secret} />
                </div>
              </div>
              <Notice icon={AlertTriangle} tone="warning">
                Callers must send this value in the{" "}
                <span className="font-mono">x-et-flow-secret</span> header or as
                a Bearer token.
              </Notice>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={logsFlow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLogsFlow(null);
            setRunDetail(null);
            setRuns([]);
          }
        }}
      >
        <DialogContent className="grid max-h-[90vh] grid-rows-[auto_minmax(0,1fr)] gap-4 sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-4" /> Activity &amp; logs
              {logsFlow ? (
                <span className="text-muted-foreground">· {logsFlow.name}</span>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          <div className="grid min-h-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="min-h-36 overflow-y-auto rounded-lg border border-border">
              {logsLoading ? (
                <div className="grid h-32 place-items-center text-sm text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : runs.length === 0 ? (
                <div className="grid h-32 place-items-center px-4 text-center text-sm text-muted-foreground">
                  No runs yet. Use Run now or trigger the flow.
                </div>
              ) : (
                runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => void openRunDetail(run)}
                    className={cn(
                      "flex w-full flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 text-left text-xs last:border-b-0 hover:bg-muted/60",
                      runDetail?.run.id === run.id && "bg-muted"
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
              {detailLoading ? (
                <div className="grid h-32 place-items-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : runDetail ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <RunStatusBadge status={runDetail.run.status} />
                    <span className="text-xs text-muted-foreground">
                      {format_datetime(runDetail.run.started_at)} ·{" "}
                      {format_duration(runDetail.run.duration_ms)}
                    </span>
                  </div>
                  {runDetail.run.error ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                      {runDetail.run.error}
                    </div>
                  ) : null}
                  {runDetail.steps.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No step details recorded.
                    </p>
                  ) : (
                    <ol className="space-y-2">
                      {runDetail.steps.map((step) => (
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
                          <pre className="mt-2 max-h-32 overflow-auto rounded bg-surface-subtle p-2 text-xs leading-relaxed text-muted-foreground">
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

      {confirm_dialog}
    </div>
  );
}
