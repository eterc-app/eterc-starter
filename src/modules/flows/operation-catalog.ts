/**
 * Serializable operation and trigger metadata.
 *
 * This module is safe to import from client components: it contains no
 * database, network or Node-only code. The server-side handlers live in
 * `operations/index.ts`.
 */

import type { FlowTrigger } from "./flow-types";

export type FlowFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "json"
  | "collection"
  | "flow"
  | "cron";

export interface FlowFieldOption {
  value: string;
  label: string;
}

export interface FlowFieldDefinition {
  name: string;
  label: string;
  type: FlowFieldType;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: FlowFieldOption[];
  defaultValue?: unknown;
  rows?: number;
}

export interface FlowOperationDefinition {
  type: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  group: "Logic" | "Items" | "HTTP" | "Flow" | "Utilities" | "Integrations";
  docs?: string;
  fields: FlowFieldDefinition[];
  defaultOptions: Record<string, unknown>;
}

const RESPONSE_BODY_FIELD: FlowFieldDefinition = {
  name: "response_body",
  label: "Response body",
  type: "select",
  description: "What the caller receives when this flow finishes.",
  options: [
    { value: "last", label: "Data of the last operation" },
    { value: "all", label: "All operation data" },
    { value: "other", label: "Other" },
  ],
  defaultValue: "last",
};

export const OPERATION_DEFINITIONS: FlowOperationDefinition[] = [
  {
    type: "condition",
    label: "Condition",
    description: "Continue only when the current data matches a filter.",
    icon: "git-branch",
    color: "var(--foreground)",
    group: "Logic",
    fields: [
      {
        name: "filter",
        label: "Filter",
        type: "json",
        description:
          "Filter evaluated against $last. A failed filter takes the reject path.",
        defaultValue: { status: { _eq: "published" } },
      },
    ],
    defaultOptions: { filter: { status: { _eq: "published" } } },
  },
  {
    type: "item-read",
    label: "Read item",
    description: "Read one item from a collection.",
    icon: "search",
    color: "var(--foreground)",
    group: "Items",
    fields: [
      {
        name: "collection",
        label: "Collection",
        type: "collection",
        required: true,
      },
      {
        name: "key",
        label: "Item key",
        type: "text",
        placeholder: "{{ $trigger.body.id }}",
        required: true,
      },
    ],
    defaultOptions: { collection: "", key: "{{ $trigger.body.id }}" },
  },
  {
    type: "item-create",
    label: "Create item",
    description: "Create an item in a collection.",
    icon: "plus",
    color: "var(--foreground)",
    group: "Items",
    fields: [
      {
        name: "collection",
        label: "Collection",
        type: "collection",
        required: true,
      },
      {
        name: "payload",
        label: "Payload",
        type: "json",
        description: "Values to write. Templates such as {{ $last.title }} are resolved.",
        defaultValue: {},
      },
    ],
    defaultOptions: { collection: "", payload: {} },
  },
  {
    type: "item-update",
    label: "Update item",
    description: "Update one item in a collection.",
    icon: "pencil",
    color: "var(--foreground)",
    group: "Items",
    fields: [
      {
        name: "collection",
        label: "Collection",
        type: "collection",
        required: true,
      },
      {
        name: "key",
        label: "Item key",
        type: "text",
        placeholder: "{{ $last.id }}",
        required: true,
      },
      {
        name: "payload",
        label: "Payload",
        type: "json",
        defaultValue: {},
      },
    ],
    defaultOptions: { collection: "", key: "{{ $last.id }}", payload: {} },
  },
  {
    type: "item-delete",
    label: "Delete item",
    description: "Delete one item from a collection.",
    icon: "trash-2",
    color: "var(--foreground)",
    group: "Items",
    fields: [
      {
        name: "collection",
        label: "Collection",
        type: "collection",
        required: true,
      },
      {
        name: "key",
        label: "Item key",
        type: "text",
        placeholder: "{{ $last.id }}",
        required: true,
      },
    ],
    defaultOptions: { collection: "", key: "{{ $last.id }}" },
  },
  {
    type: "request",
    label: "Web request",
    description: "Call an HTTP endpoint and return its response.",
    icon: "globe",
    color: "var(--foreground)",
    group: "HTTP",
    fields: [
      {
        name: "url",
        label: "URL",
        type: "text",
        placeholder: "https://api.example.com/items",
        required: true,
      },
      {
        name: "method",
        label: "Method",
        type: "select",
        options: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({
          value,
          label: value,
        })),
        defaultValue: "GET",
      },
      {
        name: "headers",
        label: "Headers",
        type: "json",
        description: "Add request headers. Values may use templates.",
        defaultValue: {},
      },
      {
        name: "body",
        label: "Body",
        type: "json",
        defaultValue: {},
      },
      {
        name: "timeout_ms",
        label: "Timeout (ms)",
        type: "number",
        defaultValue: 10000,
      },
    ],
    defaultOptions: {
      url: "",
      method: "GET",
      headers: {},
      body: {},
      timeout_ms: 10000,
    },
  },
  {
    type: "trigger",
    label: "Run another flow",
    description: "Trigger another active flow and optionally return its data.",
    icon: "workflow",
    color: "var(--foreground)",
    group: "Flow",
    fields: [
      { name: "flow_id", label: "Flow", type: "flow", required: true },
      {
        name: "payload",
        label: "Payload",
        type: "json",
        description: "Sent to the target flow as $trigger.body.",
        defaultValue: {},
      },
      RESPONSE_BODY_FIELD,
      {
        name: "response_body_other",
        label: "Other response",
        type: "text",
        placeholder: "{{ $last.data }}",
      },
    ],
    defaultOptions: {
      flow_id: "",
      payload: {},
      response_body: "last",
      response_body_other: "",
    },
  },
  {
    type: "transform",
    label: "Transform data",
    description: "Build a new value from templates without writing code.",
    icon: "wand-2",
    color: "var(--foreground)",
    group: "Utilities",
    fields: [
      {
        name: "json",
        label: "Output value",
        type: "json",
        description:
          "A JSON value whose strings may contain templates. The result becomes $last.",
        defaultValue: {},
      },
    ],
    defaultOptions: { json: {} },
  },
  {
    type: "log",
    label: "Log message",
    description: "Write a message to the server log and the run detail.",
    icon: "scroll-text",
    color: "var(--foreground)",
    group: "Utilities",
    fields: [
      {
        name: "message",
        label: "Message",
        type: "text",
        required: true,
        placeholder: "Processed {{ $trigger.body.id }}",
      },
      {
        name: "level",
        label: "Level",
        type: "select",
        options: ["info", "warn", "error"].map((value) => ({
          value,
          label: value.toUpperCase(),
        })),
        defaultValue: "info",
      },
    ],
    defaultOptions: { message: "", level: "info" },
  },
  {
    type: "sleep",
    label: "Sleep",
    description: "Pause the flow for a short time.",
    icon: "clock",
    color: "var(--foreground)",
    group: "Utilities",
    fields: [
      {
        name: "milliseconds",
        label: "Duration (ms)",
        type: "number",
        description: "Capped at 60,000 ms.",
        defaultValue: 1000,
      },
    ],
    defaultOptions: { milliseconds: 1000 },
  },
  {
    type: "throw-error",
    label: "Throw error",
    description: "Reject the flow with a custom message.",
    icon: "triangle-alert",
    color: "var(--foreground)",
    group: "Logic",
    fields: [
      {
        name: "message",
        label: "Error message",
        type: "text",
        required: true,
        placeholder: "The record is not ready.",
      },
    ],
    defaultOptions: { message: "The flow rejected this operation." },
  },
  {
    type: "send-email",
    label: "Send email",
    description: "Send a transactional email through the configured email provider.",
    icon: "mail",
    color: "var(--foreground)",
    group: "Integrations",
    fields: [
      {
        name: "to",
        label: "To",
        type: "text",
        required: true,
        placeholder: "{{ $trigger.body.email }}",
      },
      {
        name: "subject",
        label: "Subject",
        type: "text",
        required: true,
      },
      {
        name: "html",
        label: "HTML body",
        type: "textarea",
        required: true,
        rows: 6,
      },
      {
        name: "text",
        label: "Plain text",
        type: "textarea",
        rows: 3,
      },
    ],
    defaultOptions: { to: "", subject: "", html: "", text: "" },
  },
  {
    type: "send-sms",
    label: "Send SMS",
    description: "Send a text message through the configured SMS provider.",
    icon: "message-square",
    color: "var(--foreground)",
    group: "Integrations",
    fields: [
      {
        name: "to",
        label: "To",
        type: "text",
        required: true,
        placeholder: "+15551234567",
      },
      {
        name: "body",
        label: "Message",
        type: "textarea",
        required: true,
        rows: 3,
      },
    ],
    defaultOptions: { to: "", body: "" },
  },
  {
    type: "send-whatsapp",
    label: "Send WhatsApp",
    description: "Send a WhatsApp text message through the configured provider.",
    icon: "message-circle",
    color: "var(--foreground)",
    group: "Integrations",
    fields: [
      {
        name: "to",
        label: "To",
        type: "text",
        required: true,
        placeholder: "+15551234567",
      },
      {
        name: "body",
        label: "Message",
        type: "textarea",
        required: true,
        rows: 3,
      },
    ],
    defaultOptions: { to: "", body: "" },
  },
  {
    type: "send-telegram",
    label: "Send Telegram",
    description: "Send a message through the configured Telegram bot.",
    icon: "send",
    color: "var(--foreground)",
    group: "Integrations",
    fields: [
      {
        name: "chat_id",
        label: "Chat ID",
        type: "text",
        required: true,
        placeholder: "{{ $trigger.body.chat_id }}",
      },
      {
        name: "text",
        label: "Message",
        type: "textarea",
        required: true,
        rows: 3,
      },
    ],
    defaultOptions: { chat_id: "", text: "" },
  },
  {
    type: "ai-generate",
    label: "Generate with AI",
    description: "Generate text through the configured AI provider.",
    icon: "sparkles",
    color: "var(--foreground)",
    group: "Integrations",
    fields: [
      {
        name: "prompt",
        label: "Prompt",
        type: "textarea",
        required: true,
        rows: 5,
      },
      {
        name: "system",
        label: "System prompt",
        type: "textarea",
        rows: 3,
      },
    ],
    defaultOptions: { prompt: "", system: "" },
  },
  {
    type: "payment-create-link",
    label: "Create payment link",
    description: "Create a checkout link through the configured payment provider.",
    icon: "credit-card",
    color: "var(--foreground)",
    group: "Integrations",
    fields: [
      {
        name: "email",
        label: "Customer email",
        type: "text",
        required: true,
        placeholder: "{{ $trigger.body.email }}",
      },
      {
        name: "amount",
        label: "Amount",
        type: "number",
        required: true,
        defaultValue: 1000,
      },
      {
        name: "currency",
        label: "Currency",
        type: "text",
        required: true,
        defaultValue: "NGN",
        placeholder: "NGN",
      },
      {
        name: "reference",
        label: "Reference",
        type: "text",
        placeholder: "order-{{ $last.id }}",
      },
      {
        name: "callback_url",
        label: "Callback URL",
        type: "text",
        placeholder: "https://example.com/payment/complete",
      },
    ],
    defaultOptions: {
      email: "",
      amount: 1000,
      currency: "NGN",
      reference: "",
      callback_url: "",
    },
  },
  {
    type: "payment-verify",
    label: "Verify payment",
    description: "Verify a payment reference with the configured payment provider.",
    icon: "badge-check",
    color: "var(--foreground)",
    group: "Integrations",
    fields: [
      {
        name: "reference",
        label: "Reference",
        type: "text",
        required: true,
        placeholder: "{{ $last.reference }}",
      },
    ],
    defaultOptions: { reference: "" },
  },
];

export const OPERATION_GROUPS = [
  "Logic",
  "Items",
  "HTTP",
  "Flow",
  "Integrations",
  "Utilities",
] as const;

export function get_operation_definition(
  type: string
): FlowOperationDefinition | undefined {
  return OPERATION_DEFINITIONS.find((definition) => definition.type === type);
}

export function default_operation_options(type: string): Record<string, unknown> {
  const definition = get_operation_definition(type);
  return definition ? structuredClone(definition.defaultOptions) : {};
}

export interface FlowTriggerDefinition {
  type: FlowTrigger;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  color: string;
}

export const TRIGGER_DEFINITIONS: FlowTriggerDefinition[] = [
  {
    type: "event",
    label: "Event Hook",
    shortLabel: "Event",
    description: "Run when items are created, updated or deleted.",
    icon: "zap",
    color: "var(--foreground)",
  },
  {
    type: "webhook",
    label: "Webhook",
    shortLabel: "Webhook",
    description: "Run from an authenticated HTTP request.",
    icon: "webhook",
    color: "var(--foreground)",
  },
  {
    type: "schedule",
    label: "Schedule",
    shortLabel: "Schedule",
    description: "Run on a recurring CRON schedule.",
    icon: "calendar-clock",
    color: "var(--foreground)",
  },
  {
    type: "operation",
    label: "Another Flow",
    shortLabel: "Flow",
    description: "Run when another flow triggers it.",
    icon: "workflow",
    color: "var(--foreground)",
  },
  {
    type: "manual",
    label: "Manual",
    shortLabel: "Manual",
    description: "Run on demand from a collection page or the builder.",
    icon: "mouse-pointer-click",
    color: "var(--foreground)",
  },
];

export function get_trigger_definition(
  type: FlowTrigger
): FlowTriggerDefinition | undefined {
  return TRIGGER_DEFINITIONS.find((definition) => definition.type === type);
}

export const CRON_PRESETS: FlowFieldOption[] = [
  { value: "*/5 * * * *", label: "Every 5 minutes" },
  { value: "*/15 * * * *", label: "Every 15 minutes" },
  { value: "0 * * * *", label: "Hourly" },
  { value: "0 0 * * *", label: "Daily at midnight" },
  { value: "0 9 * * 1-5", label: "Weekdays at 09:00" },
  { value: "0 0 1 * *", label: "Monthly on the 1st" },
];
