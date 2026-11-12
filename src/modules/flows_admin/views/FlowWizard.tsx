"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  Loader2,
  Lock,
  X,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CRON_PRESETS,
  TRIGGER_DEFINITIONS,
} from "@/modules/flows/operation-catalog";
import type { FlowRecord, FlowTrigger } from "@/modules/flows/flow-types";
import { flows_call } from "./flow-ui";

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

type Step = "setup" | "trigger" | "secret";
type Accountability = "all" | "activity" | "none";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

function FormField({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="type-note text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CheckOption({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

function ResponseChoice({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const options = [
    { value: "last", label: "Data of Last Operation" },
    { value: "all", label: "All Data" },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border p-3 text-left text-sm transition-colors",
              selected
                ? "border-foreground bg-surface-subtle"
                : "border-border bg-card hover:bg-muted/40"
            )}
          >
            <span
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded-full border",
                selected ? "border-foreground" : "border-input"
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full bg-foreground transition-opacity",
                  selected ? "opacity-100" : "opacity-0"
                )}
              />
            </span>
            {option.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onChange("other")}
        className={cn(
          "flex items-center gap-2.5 rounded-lg border border-dashed p-3 text-left text-sm transition-colors",
          value === "other"
            ? "border-foreground bg-surface-subtle"
            : "border-border bg-card text-muted-foreground hover:bg-muted/40"
        )}
      >
        <span className="grid size-4 place-items-center">
          <span className="text-base leading-none">+</span>
        </span>
        Other…
      </button>
    </div>
  );
}

export function FlowWizard({ open, onOpenChange, collections, onCreated }: WizardProps) {
  const [step, setStep] = useState<Step>("setup");
  const [trigger, setTrigger] = useState<FlowTrigger | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [icon, setIcon] = useState("zap");
  const [color, setColor] = useState("#000000");
  const [accountability, setAccountability] = useState<Accountability>("all");

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
    setStep("setup");
    setTrigger(null);
    setName("");
    setDescription("");
    setStatus("active");
    setIcon("zap");
    setColor("#000000");
    setAccountability("all");
    setEventType("filter");
    setEventCollections([]);
    setEventActions(["create", "update", "delete"]);
    setWebhookMethod("POST");
    setWebhookAsync(false);
    setWebhookErrorOnReject(true);
    setWebhookResponse("last");
    setWebhookOther("");
    setWebhookCache(false);
    setWebhookPublic(false);
    setIntervalValue("0 * * * *");
    setFlowResponse("last");
    setFlowOther("");
    setManualCollections([]);
    setManualAsync(false);
    setManualErrorOnReject(true);
    setManualLocations(["item"]);
    setManualSelection(true);
    setManualConfirm(false);
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
    if (!trigger) return "Choose what starts this flow.";
    if (trigger === "event") {
      if (eventCollections.length === 0) return "Choose at least one collection.";
      if (eventActions.length === 0) return "Choose at least one event.";
    }
    if (trigger === "schedule" && !interval.trim()) return "Enter a CRON interval.";
    if (trigger === "webhook" && webhookResponse === "other" && !webhookOther.trim()) {
      return "Describe the custom webhook response body.";
    }
    if (trigger === "operation" && flowResponse === "other" && !flowOther.trim()) {
      return "Describe the custom response body for this flow.";
    }
    if (trigger === "manual") {
      if (manualCollections.length === 0) return "Choose at least one collection.";
      if (manualLocations.length === 0) return "Choose where the flow can be started.";
    }
    return null;
  }, [
    name,
    trigger,
    eventCollections,
    eventActions,
    interval,
    webhookResponse,
    webhookOther,
    flowResponse,
    flowOther,
    manualCollections,
    manualLocations,
  ]);

  const validationError = validate();

  const create = useCallback(async () => {
    const error = validate();
    if (error || !trigger) {
      toast.error(error ?? "Choose what starts this flow.");
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
        accountability: accountability === "none" ? null : accountability,
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
    trigger,
    name,
    description,
    icon,
    color,
    status,
    accountability,
    buildOptions,
    onCreated,
    close,
  ]);

  const openBuilder = useCallback(() => {
    if (!created) return;
    onCreated(created.flow, created.secret, created.webhook_url);
    close(false);
  }, [created, onCreated, close]);

  const collectionList = (
    <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-border bg-surface-subtle p-2 sm:grid-cols-2">
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

  const stepRail = (
    <aside className="hidden border-r border-border bg-surface-subtle p-3 md:flex md:flex-col">
      <div className="px-2 pb-3 pt-1 text-xs font-semibold text-muted-foreground">
        New flow
      </div>
      <nav className="space-y-1" aria-label="Flow setup steps">
        {(
          [
            { id: "setup" as const, label: "Flow Setup" },
            { id: "trigger" as const, label: "Trigger Setup" },
          ]
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setStep(entry.id)}
            className={cn(
              "flex h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium transition-colors",
              step === entry.id
                ? "border border-border bg-card text-foreground"
                : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
            )}
          >
            {entry.label}
            {step === entry.id ? <ChevronRight className="size-3.5" /> : null}
          </button>
        ))}
      </nav>
      <div className="mt-auto pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => close(false)}
        >
          <ArrowLeft />
          Cancel
        </Button>
      </div>
    </aside>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-5xl"
        showCloseButton={false}
      >
        <div className="grid min-h-[620px] grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
          {step === "secret" ? null : stepRail}

          <div className="flex min-h-0 flex-col">
            <header className="flex items-center gap-3 border-b border-border px-5 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-subtle text-foreground">
                {step === "secret" ? (
                  <Lock className="size-4" />
                ) : triggerDefinition ? (
                  <DynamicIcon name={triggerDefinition.icon} size={20} />
                ) : (
                  <Box className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-lg font-semibold">
                  {step === "secret" ? "Save your webhook secret" : "Creating New Flow"}
                </DialogTitle>
                <DialogDescription className="truncate text-xs text-muted-foreground">
                  {step === "setup"
                    ? "Name the flow and choose how it is presented."
                    : step === "trigger"
                      ? triggerDefinition?.description ??
                        "Choose what starts this automation."
                      : "This secret is shown once. Store it before continuing."}
                </DialogDescription>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {step === "setup" ? (
                  <Button
                    size="icon"
                    variant="outline"
                    title="Continue to trigger setup"
                    aria-label="Continue to trigger setup"
                    onClick={() => setStep("trigger")}
                  >
                    <ArrowRight className="size-4" />
                  </Button>
                ) : null}
                {step === "trigger" ? (
                  <Button
                    size="icon"
                    title="Create flow"
                    aria-label="Create flow"
                    disabled={Boolean(validationError) || creating}
                    onClick={() => void create()}
                  >
                    {creating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                  </Button>
                ) : null}
                {step === "secret" ? (
                  <Button
                    size="icon"
                    title="Open the builder"
                    aria-label="Open the builder"
                    onClick={openBuilder}
                  >
                    <ArrowRight className="size-4" />
                  </Button>
                ) : null}
                <Button
                  size="icon"
                  variant="ghost"
                  title="Close"
                  aria-label="Close"
                  onClick={() => close(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </header>

            <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">
              {step !== "secret" ? (
                <div className="mb-4 flex gap-2 md:hidden">
                  {(
                    [
                      { id: "setup" as const, label: "Flow Setup" },
                      { id: "trigger" as const, label: "Trigger Setup" },
                    ]
                  ).map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setStep(entry.id)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold",
                        step === entry.id
                          ? "border-foreground bg-surface-subtle"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {step === "setup" ? (
                <div className="grid gap-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField label="Name" htmlFor="flow-name" required>
                      <Input
                        id="flow-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Push Notification Trigger"
                        autoFocus
                      />
                    </FormField>
                    <FormField label="Status" htmlFor="flow-status">
                      <Select
                        value={status}
                        onValueChange={(value) => setStatus(value as "active" | "inactive")}
                      >
                        <SelectTrigger id="flow-status" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                  </div>

                  <FormField label="Description" htmlFor="flow-description">
                    <Textarea
                      id="flow-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Describe what this flow does."
                      className="min-h-24"
                    />
                  </FormField>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField label="Icon">
                      <IconPicker value={icon} onChange={setIcon} color={color} />
                    </FormField>
                    <FormField label="Color">
                      <ColorPicker value={color} onChange={setColor} />
                    </FormField>
                  </div>

                  <div className="h-px bg-border" />

                  <FormField label="Activity & Logs Tracking" htmlFor="flow-accountability">
                    <Select
                      value={accountability}
                      onValueChange={(value) => setAccountability(value as Accountability)}
                    >
                      <SelectTrigger id="flow-accountability" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Track Activity &amp; Logs</SelectItem>
                        <SelectItem value="activity">Track Activity Only</SelectItem>
                        <SelectItem value="none">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>
              ) : null}

              {step === "trigger" ? (
                <div className="grid gap-4">
                  {trigger === null ? (
                    <div className="grid gap-2.5">
                      {TRIGGER_DEFINITIONS.map((definition) => (
                        <button
                          key={definition.type}
                          type="button"
                          onClick={() => setTrigger(definition.type)}
                          className="flex items-start gap-3.5 rounded-xl bg-surface-subtle p-4 text-left transition-colors hover:bg-muted"
                        >
                          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card">
                            <DynamicIcon name={definition.icon} size={18} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">
                              {definition.label}
                            </span>
                            <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">
                              {definition.description}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3.5 rounded-xl border border-foreground bg-surface-subtle p-4">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card">
                          <DynamicIcon name={triggerDefinition?.icon ?? "zap"} size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">
                            {triggerDefinition?.label}
                          </span>
                          <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">
                            {triggerDefinition?.description}
                          </span>
                        </span>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Choose a different trigger"
                          aria-label="Choose a different trigger"
                          onClick={() => setTrigger(null)}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>

                      {trigger === "event" ? (
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label className="text-sm font-semibold">Type</Label>
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
                                    "rounded-lg border p-3 text-left text-sm transition-colors",
                                    eventType === option.value
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
                          </div>
                          <FormField label="Collections" required>
                            {collectionList}
                          </FormField>
                          <FormField label="Events" required>
                            <div className="flex flex-wrap gap-4">
                              {(["create", "update", "delete"] as const).map((action) => (
                                <label key={action} className="flex items-center gap-2 text-sm capitalize">
                                  <Checkbox
                                    checked={eventActions.includes(action)}
                                    onCheckedChange={() =>
                                      setEventActions((current) => toggle(current, action))
                                    }
                                  />
                                  {action}
                                </label>
                              ))}
                            </div>
                          </FormField>
                        </div>
                      ) : null}

                      {trigger === "webhook" ? (
                        <div className="grid gap-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <FormField label="Method" htmlFor="webhook-method">
                              <Select value={webhookMethod} onValueChange={setWebhookMethod}>
                                <SelectTrigger id="webhook-method" className="w-full">
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
                            </FormField>
                            <FormField label="Asynchronous" required>
                              <CheckOption
                                checked={webhookAsync}
                                onChange={setWebhookAsync}
                                label="Enabled"
                                description="Respond immediately and run in the queue."
                              />
                            </FormField>
                          </div>

                          <FormField label="Error on Reject">
                            <CheckOption
                              checked={webhookErrorOnReject}
                              onChange={setWebhookErrorOnReject}
                              label="Enabled"
                              description="Return an error status when the flow rejects."
                            />
                          </FormField>

                          <FormField label="Response Body">
                            <ResponseChoice value={webhookResponse} onChange={setWebhookResponse} />
                          </FormField>
                          {webhookResponse === "other" ? (
                            <FormField
                              label="Custom response"
                              htmlFor="webhook-other"
                              hint="A template such as {{ $last.data }} or {{ $trigger.body }}."
                            >
                              <Input
                                id="webhook-other"
                                value={webhookOther}
                                onChange={(event) => setWebhookOther(event.target.value)}
                                placeholder="{{ $last }}"
                                className="font-mono"
                              />
                            </FormField>
                          ) : null}

                          <div className="grid gap-2 sm:grid-cols-2">
                            <CheckOption
                              checked={webhookCache}
                              onChange={setWebhookCache}
                              label="Cache"
                              description="Keep successful GET results for 30 seconds."
                            />
                            <CheckOption
                              checked={webhookPublic}
                              onChange={setWebhookPublic}
                              label="Public endpoint"
                              description="Skip the per-flow secret. Not recommended."
                            />
                          </div>
                        </div>
                      ) : null}

                      {trigger === "schedule" ? (
                        <div className="grid gap-4">
                          <FormField
                            label="Interval"
                            htmlFor="schedule-interval"
                            required
                            hint="Five fields: minute hour day month weekday. Schedules run in UTC."
                          >
                            <Input
                              id="schedule-interval"
                              value={interval}
                              onChange={(event) => setIntervalValue(event.target.value)}
                              placeholder="0 * * * *"
                              className="font-mono"
                            />
                          </FormField>
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
                        </div>
                      ) : null}

                      {trigger === "operation" ? (
                        <div className="grid gap-4">
                          <FormField label="Response Body">
                            <ResponseChoice value={flowResponse} onChange={setFlowResponse} />
                          </FormField>
                          {flowResponse === "other" ? (
                            <FormField label="Custom response" htmlFor="flow-other">
                              <Input
                                id="flow-other"
                                value={flowOther}
                                onChange={(event) => setFlowOther(event.target.value)}
                                placeholder="{{ $last }}"
                                className="font-mono"
                              />
                            </FormField>
                          ) : null}
                        </div>
                      ) : null}

                      {trigger === "manual" ? (
                        <div className="grid gap-4">
                          <FormField label="Collections" required>
                            {collectionList}
                          </FormField>
                          <FormField label="Location" required>
                            <div className="flex flex-wrap gap-4">
                              {(["collection", "item"] as const).map((location) => (
                                <label key={location} className="flex items-center gap-2 text-sm capitalize">
                                  <Checkbox
                                    checked={manualLocations.includes(location)}
                                    onCheckedChange={() =>
                                      setManualLocations((current) => toggle(current, location))
                                    }
                                  />
                                  {location} page
                                </label>
                              ))}
                            </div>
                          </FormField>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <CheckOption
                              checked={manualSelection}
                              onChange={setManualSelection}
                              label="Requires selection"
                              description="On collection pages, run for selected items only."
                            />
                            <CheckOption
                              checked={manualConfirm}
                              onChange={setManualConfirm}
                              label="Require confirmation"
                              description="Ask before starting the flow."
                            />
                            <CheckOption
                              checked={manualAsync}
                              onChange={setManualAsync}
                              label="Async"
                              description="Queue the run instead of waiting for it."
                            />
                            <CheckOption
                              checked={manualErrorOnReject}
                              onChange={setManualErrorOnReject}
                              label="Error on reject"
                              description="Show a rejected result to the operator."
                            />
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              {step === "secret" && created ? (
                <div className="mx-auto grid max-w-xl gap-5 py-4">
                  <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
                    <p className="font-semibold">Copy this secret now.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Eterc stores only a hash. You can rotate it later, but you cannot see this
                      value again.
                    </p>
                  </div>
                  <FormField label="Webhook URL">
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={created.webhook_url ?? ""}
                        className="font-mono text-xs"
                      />
                      <CopyButton value={created.webhook_url ?? ""} />
                    </div>
                  </FormField>
                  <FormField label="Secret">
                    <div className="flex items-center gap-2">
                      <Input readOnly value={created.secret ?? ""} className="font-mono text-xs" />
                      <CopyButton value={created.secret ?? ""} />
                    </div>
                  </FormField>
                  <Button className="w-full" onClick={openBuilder}>
                    Open the builder
                    <ArrowRight />
                  </Button>
                </div>
              ) : null}
            </div>

            {step === "trigger" && validationError ? (
              <div className="border-t border-border px-5 py-3 text-xs text-warning md:px-6">
                {validationError}
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
