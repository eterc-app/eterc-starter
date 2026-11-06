import type {
  CmsChoice,
  CmsField,
  CmsFieldInterface,
  CmsFieldType,
} from "@/modules/cms/cms-types";
import {
  cms_interface_default_type,
  cms_interface_defaults,
  cms_normalize_choices,
} from "@/modules/cms/cms-interfaces";

/**
 * The editable shape of a field in the Data Studio drawer.
 *
 * Directus keeps the interface, the storage type, the interface options and
 * the list of choices in separate places. The form mirrors that split so the
 * drawer can switch interfaces without losing the underlying column.
 */
export interface FieldFormState {
  name: string;
  label: string;
  type: CmsFieldType;
  interface: CmsFieldInterface;
  required: boolean;
  unique: boolean;
  hidden: boolean;
  readonly: boolean;
  choices: CmsChoice[];
  defaultValue: string;
  group: string | null;
  options: Record<string, unknown>;
}

export function slugify_field_name(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function default_text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export function empty_field_form(
  interfaceId: CmsFieldInterface = "input"
): FieldFormState {
  return {
    name: "",
    label: "",
    type: cms_interface_default_type(interfaceId),
    interface: interfaceId,
    required: false,
    unique: false,
    hidden: false,
    readonly: false,
    choices: [],
    defaultValue: "",
    group: null,
    options: cms_interface_defaults(interfaceId),
  };
}

export function field_form_from_field(field: CmsField): FieldFormState {
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    interface: field.interface,
    required: field.required,
    unique: field.unique,
    hidden: field.hidden,
    readonly: field.readonly,
    choices: cms_normalize_choices(field.options?.choices),
    defaultValue: default_text(field.options?.default),
    group: field.group ?? null,
    options: { ...(field.options ?? {}) },
  };
}

/**
 * Convert the drawer's text default into the value stored on the field.
 * JSON interfaces accept a JSON document, numeric columns accept numbers and
 * everything else is stored as text. An empty input removes the default.
 */
export function parse_field_default(
  type: CmsFieldType,
  text: string
): unknown {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  if (type === "integer") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : trimmed;
  }
  if (type === "decimal") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : trimmed;
  }
  if (type === "relation") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : trimmed;
  }
  if (type === "boolean") {
    return ["true", "1", "yes", "on"].includes(trimmed.toLowerCase());
  }
  if (type === "json") {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}
