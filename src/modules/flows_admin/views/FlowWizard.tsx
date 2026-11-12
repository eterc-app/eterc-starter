"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/modules/cms_admin/views/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { IconPicker } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  CRON_PRESETS,
  TRIGGER_DEFINITIONS,
} from "@/modules/flows/operation-catalog";
import type { FlowRecord, FlowTrigger } from "@/modules/flows/flow-types";
import { Field, Segmented, flows_call } from "./flow-ui";

interface CollectionOption {
  name: string;
  label: string;
  primary_key: string;
}

interface CreateResult {
  flow: FlowRecord;
  secret: string | null;
  webhook_url: string | null;
}

interface WizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: CollectionOption[];
  onCreated: (flow: FlowRecord, secret: string | null, webhookUrl: string | null) => void;
}

type Step = "trigger" | "setup" | "secret";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

export function FlowWizard({ open, onOpenChange, collections, onCreated }: WizardProps) {
  const [step, setStep] = useState<Step>("trigger");
  const [trigger, setTrigger] = useState<FlowTrigger>("event");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("inactive");
  const [icon, setIcon] = useState("zap");
  const [color, setColor] = useState("#6366f1");
  const [trackLogs, setTrackLogs] = useState(true);

  const [eventType, setEventType] = useState<"filter" | "action">("filter");
  const [eventCollections, setEventCollections] = useState<string[]>([]);
  const [eventActions, setEventActions] = useState<Array<"create" | "update" | "delete">>([
    "create",
    "update",
    "delete",
  ]);

  const [webhookMethod, setWebhookMethod] = useState("POST");
  const [webhookAsync, setWebhookAsync] = useState(false);
  const [webhookErrorOnReject, setWebhookErrorOnReject] = useState(true);
  const [webhookResponse, setWebhookResponse] = useState("last");
  const [webhookOther, setWebhookOther] = useState("");
  const [webhookCache, setWebhookCache] = useState(false);
  const [webhookPublic, setWebhookPublic] = useState(false);

  const [interval, setIntervalValue] = useState("0 * * * *");

  const [flowResponse, setFlowResponse] = useState("last");
  const [flowOther, setFlowOther] = useState("");

  const [manualCollections, setManualCollections] = useState<string[]>([]);
  const [manualAsync, setManualAsync] = useState(false);
  const [manualErrorOnReject, setManualErrorOnReject] = useState(true);
  const [manualLocations, setManualLocations] = useState<Array<"collection" | "item">>([
    "item",
  ]);
  const [manualSelection, setManualSelection] = useState(true);
  const [manualConfirm, setManualConfirm] = useState(false);

  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreateResult | null>(null);

  const reset = useCallback(() => {
    setStep("trigger");
    setTrigger("event");
    setName("");
    setDescription("");
    setStatus("inactive");
    setIcon("zap");
    setColor("#6366f1");
    setTrackLogs(true);
    setCreated(null);
  }, []);

  const close = useCallback(
    (next: boolean) => {
      if (!next && !creating) reset();
      onOpenChange(next);
    },
    [creating, onOpenChange, reset]
  );

  const triggerDefinition = useMemo(
    () => TRIGGER_DEFINITIONS.find((entry) => entry.type === trigger),
    [trigger]
  );

  const buildOptions = useCallback((): Record<string, unknown> => {
    switch (trigger) {
      case "event":
        return {
          type: eventType,
          collections: eventCollections,
          actions: eventActions,
        };
      case "webhook":
        return {
          method: webhookMethod,
          async: webhookAsync,
          error_on_reject: webhookErrorOnReject,
          response_body: webhookResponse,
          response_body_other: webhookOther,
          cache: webhookCache,
          public: webhookPublic,
        };
      case "schedule":
        return { interval, timezone: "UTC" };
      case "operation":
        return { response_body: flowResponse, response_body_other: flowOther };
      case "manual":
        return {
          collections: manualCollections,
          async: manualAsync,
          error_on_reject: manualErrorOnReject,
          location: manualLocations,
          collection_page_requires_selection: manualSelection,
          require_confirmation: manualConfirm,
        };
      default:
        return {};
    }
  }, [
    trigger,
    eventType,
    eventCollections,
    eventActions,
    webhookMethod,
    webhookAsync,
    webhookErrorOnReject,
    webhookResponse,
    webhookOther,
    webhookCache,
    webhookPublic,
    interval,
    flowResponse,
    flowOther,
    manualCollections,
    manualAsync,
    manualErrorOnReject,
    manualLocations,
    manualSelection,
    manualConfirm,
  ]);

  const validate = useCallback((): string | null => {
    if (!name.trim()) return "Give the flow a name.";
    if (trigger === "event") {
      if (eventCollections.length === 0) return "Choose at least one collection.";
      if (eventActions.length === 0) return "Choose at least one event.";
    }
    if (trigger === "schedule" && !interval.trim()) return "Enter a CRON interval.";
    if (trigger === "manual") {
      if (manualCollections.length === 0) return "Choose at least one collection.";
      if (manualLocations.length === 0) return "Choose where the flow can be started.";
    }
    return null;
  }, [name, trigger, eventCollections, eventActions, interval, manualCollections, manualLocations]);

  const create = useCallback(async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    setCreating(true);
    try {
      const result = await flows_call<CreateResult>("create_flow", {
        name,
        description,
        icon,
        color,
        status,
        trigger,
        accountability: trackLogs ? "all" : null,
        options: buildOptions(),
      });
      if (result.secret) {
        setCreated(result);
        setStep("secret");
      } else {
        toast.success("Flow created. Add your first operation.");
        onCreated(result.flow, null, result.webhook_url);
        close(false);
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not create the flow.");
    } finally {
      setCreating(false);
    }
  }, [
    validate,
    name,
    description,
    icon,
    color,
    status,
    trigger,
    trackLogs,
    buildOptions,
    onCreated,
    close,
  ]);

  const collectionList = (
    <div className="grid max-h-52 gap-1 overflow-y-auto rounded-lg border border-border bg-surface-subtle p-2 sm:grid-cols-2">
      {collections.length === 0 ? (
        <p className="p-2 text-xs text-muted-foreground">No collections yet.</p>
      ) : (
        collections.map((collection) => {
          const checked =
            trigger === "event"
              ? eventCollections.includes(collection.name)
              : manualCollections.includes(collection.name);
          return (
            <label
              key={collection.name}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() =>
                  trigger === "event"
                    ? setEventCollections((current) => toggle(current, collection.name))
                    : setManualCollections((current) => toggle(current, collection.name))
                }
              />
              <span className="min-w-0 truncate">{collection.label}</span>
            </label>
          );
        })
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {step === "trigger" ? (
              <Sparkles className="size-5 text-muted-foreground" />
            ) : step === "setup" ? (
              <DynamicIcon name={triggerDefinition?.icon ?? "zap"} size={20} />
            ) : (
              <Lock className="size-5 text-muted-foreground" />
            )}
            {step === "trigger"
              ? "Create a flow"
              : step === "setup"
                ? "Flow Setup"
                : "Save your webhook secret"}
          </DialogTitle>
          <DialogDescription>
            {step === "trigger"
              ? "Choose what starts this automation. You can change it later."
              : step === "setup"
                ? "Name the flow, choose its appearance, and configure the trigger."
                : "This secret is shown once. Store it before continuing."}
          </DialogDescription>
        </DialogHeader>

        {step === "trigger" ? (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                1
              </span>
              Trigger Setup
              <span className="mx-1 h-px flex-1 bg-border" />
              <span className="grid size-6 place-items-center rounded-full border border-border">
                2
              </span>
              Flow Setup
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TRIGGER_DEFINITIONS.map((definition) => {
                const selected = trigger === definition.type;
                return (
                  <button
                    key={definition.type}
                    type="button"
                    onClick={() => setTrigger(definition.type)}
                    className={cn(
                      "flex gap-3 rounded-xl border p-4 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-muted/50"
                    )}
                  >
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-subtle"
                      style={{ color: definition.color }}
                    >
                      <DynamicIcon name={definition.icon} size={20} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        {definition.label}
                        {selected ? <Check className="size-3.5 text-primary" /> : null}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {definition.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep("setup")}>
                Continue
                <ArrowRight className="size-4" />
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "setup" ? (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-primary">
                <Check className="size-3.5" />
              </span>
              Trigger Setup
              <span className="mx-1 h-px flex-1 bg-border" />
              <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                2
              </span>
              Flow Setup
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Publish release notes"
                  autoFocus
                />
              </Field>
              <div className="grid gap-1.5">
                <span className="text-xs font-semibold text-foreground">Status</span>
                <Segmented
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                />
              </div>
            </div>

            <Field label="Description">
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What does this flow do?"
                className="min-h-20"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <span className="text-xs font-semibold text-foreground">Icon</span>
                <IconPicker value={icon} onChange={setIcon} color={color} />
              </div>
              <div className="grid gap-1.5">
                <span className="text-xs font-semibold text-foreground">Color</span>
                <ColorPicker value={color} onChange={setColor} />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <DynamicIcon name={triggerDefinition?.icon ?? "zap"} size={16} />
                <div>
                  <p className="text-sm font-semibold">{triggerDefinition?.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {triggerDefinition?.description}
                  </p>
                </div>
              </div>
              <div className="space-y-4 p-4">
                {trigger === "event" ? (
                  <>
                    <div className="grid gap-1.5">
                      <span className="text-xs font-semibold">Type</span>
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
                            onClick={() => setEventType(option.value)}
                            className={cn(
                              "rounded-lg border p-3 text-left text-xs",
                              eventType === option.value
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-muted/50"
                            )}
                          >
                            <span className="block text-sm font-semibold">{option.title}</span>
                            <span className="mt-1 block text-muted-foreground">{option.body}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <span className="text-xs font-semibold">Collections</span>
                      {collectionList}
                    </div>
                    <div className="grid gap-1.5">
                      <span className="text-xs font-semibold">Events</span>
                      <div className="flex flex-wrap gap-4">
                        {(["create", "update", "delete"] as const).map((action) => (
                          <label key={action} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={eventActions.includes(action)}
                              onCheckedChange={() =>
                                setEventActions((current) => toggle(current, action))
                              }
                            />
                            <span className="capitalize">{action}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

                {trigger === "webhook" ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Method">
                        <Select value={webhookMethod} onValueChange={setWebhookMethod}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["POST", "GET", "PUT", "PATCH", "DELETE"].map((method) => (
                              <SelectItem key={method} value={method}>
                                {method}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Response body">
                        <Select value={webhookResponse} onValueChange={setWebhookResponse}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="last">Data of the last operation</SelectItem>
                            <SelectItem value="all">All operation data</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    {webhookResponse === "other" ? (
                      <Field
                        label="Custom response"
                        hint="A template such as {{ $last.data }} or {{ $trigger.body }}."
                      >
                        <Input
                          value={webhookOther}
                          onChange={(event) => setWebhookOther(event.target.value)}
                          placeholder="{{ $last }}"
                        />
                      </Field>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                        <span>
                          Async
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Respond immediately and run in the queue.
                          </span>
                        </span>
                        <Switch checked={webhookAsync} onCheckedChange={setWebhookAsync} />
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                        <span>
                          Error on reject
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Return an error status when the flow rejects.
                          </span>
                        </span>
                        <Switch
                          checked={webhookErrorOnReject}
                          onCheckedChange={setWebhookErrorOnReject}
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                        <span>
                          Cache GET responses
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Keep successful GET results for 30 seconds.
                          </span>
                        </span>
                        <Switch checked={webhookCache} onCheckedChange={setWebhookCache} />
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                        <span>
                          Public endpoint
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Skip the per-flow secret. Not recommended.
                          </span>
                        </span>
                        <Switch checked={webhookPublic} onCheckedChange={setWebhookPublic} />
                      </label>
                    </div>
                  </>
                ) : null}

                {trigger === "schedule" ? (
                  <>
                    <Field
                      label="Interval (CRON, UTC)"
                      hint="Five fields: minute hour day month weekday."
                    >
                      <Input
                        value={interval}
                        onChange={(event) => setIntervalValue(event.target.value)}
                        placeholder="0 * * * *"
                        className="font-mono"
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      {CRON_PRESETS.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => setIntervalValue(preset.value)}
                          className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                {trigger === "operation" ? (
                  <>
                    <Field label="Response body">
                      <Select value={flowResponse} onValueChange={setFlowResponse}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="last">Data of the last operation</SelectItem>
                          <SelectItem value="all">All operation data</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {flowResponse === "other" ? (
                      <Field label="Custom response">
                        <Input
                          value={flowOther}
                          onChange={(event) => setFlowOther(event.target.value)}
                          placeholder="{{ $last }}"
                        />
                      </Field>
                    ) : null}
                  </>
                ) : null}

                {trigger === "manual" ? (
                  <>
                    <div className="grid gap-1.5">
                      <span className="text-xs font-semibold">Collections</span>
                      {collectionList}
                    </div>
                    <div className="grid gap-1.5">
                      <span className="text-xs font-semibold">Location</span>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={manualLocations.includes("collection")}
                            onCheckedChange={() =>
                              setManualLocations((current) => toggle(current, "collection"))
                            }
                          />
                          Collection page
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={manualLocations.includes("item")}
                            onCheckedChange={() =>
                              setManualLocations((current) => toggle(current, "item"))
                            }
                          />
                          Item page
                        </label>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                        <span>
                          Requires selection
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            On collection pages, run for selected items only.
                          </span>
                        </span>
                        <Switch
                          checked={manualSelection}
                          onCheckedChange={setManualSelection}
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                        <span>
                          Require confirmation
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Ask before starting the flow.
                          </span>
                        </span>
                        <Switch checked={manualConfirm} onCheckedChange={setManualConfirm} />
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                        <span>
                          Async
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Queue the run instead of waiting for it.
                          </span>
                        </span>
                        <Switch checked={manualAsync} onCheckedChange={setManualAsync} />
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                        <span>
                          Error on reject
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Show a rejected result to the operator.
                          </span>
                        </span>
                        <Switch
                          checked={manualErrorOnReject}
                          onCheckedChange={setManualErrorOnReject}
                        />
                      </label>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-subtle p-4">
              <span>
                <span className="text-sm font-semibold">Activity &amp; logs tracking</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Keep the principal, input, step output and errors for every run.
                </span>
              </span>
              <Switch checked={trackLogs} onCheckedChange={setTrackLogs} />
            </label>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("trigger")} disabled={creating}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button onClick={create} disabled={creating}>
                {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                Create flow
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "secret" && created ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
              <p className="font-semibold">Copy this secret now.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Eterc stores only a hash. You can rotate it later, but you cannot see this
                value again.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Webhook URL</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={created.webhook_url ?? ""} className="font-mono text-xs" />
                <CopyButton value={created.webhook_url ?? ""} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Secret</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={created.secret ?? ""} className="font-mono text-xs" />
                <CopyButton value={created.secret ?? ""} />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  onCreated(created.flow, created.secret, created.webhook_url);
                  close(false);
                }}
              >
                Open the builder
                <ArrowRight className="size-4" />
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
