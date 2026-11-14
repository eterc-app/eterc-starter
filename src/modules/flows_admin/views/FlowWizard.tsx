"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Box,
  Check,
  Loader2,
  Lock,
  X,
} from "lucide-react";
import { CopyButton } from "@/modules/cms_admin/views/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { IconPicker } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
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
import {
  FlowColorField,
  flow_toast_error,
  flow_toast_success,
  flows_call,
} from "./flow-ui";

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
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
        {required ? <span className="text-foreground">*</span> : null}
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

function ChoiceCard({
  selected,
  icon,
  title,
  description,
  onClick,
}: {
  selected?: boolean;
  icon?: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
        selected
          ? "border-foreground bg-card"
          : "border-border bg-card hover:bg-muted/40"
      )}
    >
      {icon ? (
        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-muted">
          <DynamicIcon name={icon} size={14} />
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-5">{title}</span>
        <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
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
    <div className="grid gap-2">
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
                ? "border-foreground bg-card"
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
            ? "border-foreground bg-card"
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
  const [status, setStatus] = useState<"active" | "inactive">("inactive");
  const [icon, setIcon] = useState("zap");
  const [color, setColor] = useState("var(--foreground)");
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
    setStatus("inactive");
    setIcon("zap");
    setColor("var(--foreground)");
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

  const create = useCallback(async () => {
    const error = validate();
    if (error || !trigger) {
      flow_toast_error(error ?? "Choose what starts this flow.");
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
        flow_toast_success("Flow created. Add your first operation.");
        onCreated(result.flow, null, result.webhook_url);
        close(false);
      }
    } catch (cause) {
      flow_toast_error(cause instanceof Error ? cause.message : "Could not create the flow.");
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
    <div className="grid max-h-96 gap-2 overflow-y-auto pr-1">
      {collections.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
          No collections yet.
        </p>
      ) : (
        collections.map((collection) => {
          const checked =
            trigger === "event"
              ? eventCollections.includes(collection.name)
              : manualCollections.includes(collection.name);
          return (
            <label
              key={collection.name}
              className={cn(
                "flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-3 py-3 text-sm transition-colors",
                checked
                  ? "border-foreground"
                  : "border-border hover:bg-muted/40"
              )}
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
    <aside className="hidden border-r border-border bg-card p-3 md:flex md:flex-col">
      <nav className="space-y-1" aria-label="Flow setup sections">
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
              "flex h-9 w-full items-center rounded-lg px-3 text-left text-sm font-medium transition-colors",
              step === entry.id
                ? "border border-border bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {entry.label}
          </button>
        ))}
      </nav>
    </aside>
  );

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent
        className="w-full max-w-[760px] gap-0 p-0"
        showCloseButton={false}
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[198px_minmax(0,1fr)]">
          {step === "secret" ? null : stepRail}

          <div className="flex min-h-0 flex-col bg-background">
            <header className="flex items-center gap-2.5 border-b border-border bg-card px-4 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted text-foreground">
                {step === "secret" ? (
                  <Lock className="size-3.5" />
                ) : triggerDefinition ? (
                  <DynamicIcon name={triggerDefinition.icon} size={16} />
                ) : (
                  <Box className="size-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-xs font-semibold">
                  {step === "secret" ? "Save your webhook secret" : "Creating New Flow"}
                </DialogTitle>
                <DialogDescription className="truncate text-xs text-muted-foreground">
                  {step === "setup"
                    ? "Name the flow and choose how it is presented."
                    : step === "trigger"
                      ? "Configure what starts this automation."
                      : "This secret is shown once. Store it before continuing."}
                </DialogDescription>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {step === "secret" ? (
                  <Button
                    size="icon-sm"
                    title="Open the builder"
                    aria-label="Open the builder"
                    onClick={openBuilder}
                  >
                    <ArrowRight className="size-3.5" />
                  </Button>
                ) : (
                  <Button
                    size="icon-sm"
                    title="Save flow"
                    aria-label="Save flow"
                    disabled={creating}
                    onClick={() => void create()}
                  >
                    {creating ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  variant="outline"
                  title="Cancel and close"
                  aria-label="Cancel and close"
                  onClick={() => close(false)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </header>

            <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {step !== "secret" ? (
                <div className="mb-4 grid gap-2 md:hidden">
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
                          ? "border-foreground bg-card"
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
                  <div className="grid gap-5">
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

                  <div className="grid gap-5">
                    <FormField label="Icon">
                      <IconPicker
                        value={icon}
                        onChange={setIcon}
                        color={color}
                        presentation="drawer"
                      />
                    </FormField>
                    <FormField label="Color">
                      <FlowColorField value={color} onChange={setColor} />
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
                    <div className="grid auto-rows-fr gap-2.5">
                      {TRIGGER_DEFINITIONS.map((definition) => (
                        <ChoiceCard
                          key={definition.type}
                          icon={definition.icon}
                          title={definition.label}
                          description={definition.description}
                          onClick={() => setTrigger(definition.type)}
                        />
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted">
                          <DynamicIcon name={triggerDefinition?.icon ?? "zap"} size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">
                            {triggerDefinition?.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                            {triggerDefinition?.description}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setTrigger(null)}
                          className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          Change
                        </button>
                      </div>

                      {trigger === "event" ? (
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label className="text-sm font-semibold">Event type</Label>
                            <div className="grid auto-rows-fr gap-2">
                              {[
                                {
                                  value: "filter" as const,
                                  icon: "filter",
                                  title: "Filter (Blocking)",
                                  body: "Runs before the write and can block it.",
                                },
                                {
                                  value: "action" as const,
                                  icon: "zap",
                                  title: "Action (Non-Blocking)",
                                  body: "Runs after the write, without slowing the request.",
                                },
                              ].map((option) => (
                                <ChoiceCard
                                  key={option.value}
                                  icon={option.icon}
                                  title={option.title}
                                  description={option.body}
                                  selected={eventType === option.value}
                                  onClick={() => setEventType(option.value)}
                                />
                              ))}
                            </div>
                          </div>
                          <FormField
                            label={
                              <span className="flex items-center gap-2">
                                Collections
                                <Badge variant="outline">
                                  {eventCollections.length} selected
                                </Badge>
                              </span>
                            }
                            required
                          >
                            {collectionList}
                          </FormField>
                          <FormField
                            label={
                              <span className="flex items-center gap-2">
                                Events
                                <Badge variant="outline">
                                  {eventActions.length} selected
                                </Badge>
                              </span>
                            }
                            required
                          >
                            <div className="grid gap-2">
                              {[
                                { value: "create" as const, title: "Create" },
                                { value: "update" as const, title: "Update" },
                                { value: "delete" as const, title: "Delete" },
                              ].map((option) => {
                                const checked = eventActions.includes(option.value);
                                return (
                                  <label
                                    key={option.value}
                                    className={cn(
                                      "flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors",
                                      checked
                                        ? "border-foreground"
                                        : "border-border hover:bg-muted/40"
                                    )}
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={() =>
                                        setEventActions((current) =>
                                          toggle(current, option.value)
                                        )
                                      }
                                    />
                                    <span className="min-w-0 flex-1 font-semibold">
                                      {option.title}
                                    </span>
                                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                      items.{option.value}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </FormField>
                        </div>
                      ) : null}

                      {trigger === "webhook" ? (
                        <div className="grid gap-4">
                          <div className="grid gap-4">
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

                          <div className="grid gap-2">
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
                          <div className="grid gap-2">
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
                <div className="grid gap-5 py-4">
                  <div className="rounded-xl border border-border bg-card p-4 text-sm">
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
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
