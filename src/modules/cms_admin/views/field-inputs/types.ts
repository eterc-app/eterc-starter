"use client";

import type { ReactNode } from "react";
import type {
  CmsChoice,
  CmsCollectionWithFields,
  CmsField,
  CmsFieldInterface,
} from "@/modules/cms/cms-types";
import {
  cms_field_interface,
  cms_interface_definition,
  cms_normalize_choices,
} from "@/modules/cms/cms-interfaces";

/** Upload/library configuration passed from the content view. */
export interface CmsMediaConfig {
  csrfToken: string;
  uploadUrl: string;
  apiRoot: string;
}

export interface CmsMediaImage {
  file: string;
  url: string;
  thumbnail_url: string;
  title: string;
  alt?: string;
}

export interface FieldInputProps {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  media?: CmsMediaConfig;
  collections?: CmsCollectionWithFields[];
}

export interface CmsFieldFormProps {
  fields: CmsField[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  disabled?: boolean;
  media?: CmsMediaConfig;
  collections?: CmsCollectionWithFields[];
}

export type FieldRenderer = (
  field: CmsField,
  value: unknown,
  onChange: (value: unknown) => void
) => ReactNode;

/**
 * Read an option by any of its known names. Directus option names are
 * camelCase, while projects created by older versions of this CMS used
 * snake_case. Both must keep working.
 */
export function option_value(field: CmsField, ...keys: string[]): unknown {
  const options = field.options ?? {};
  for (const key of keys) {
    const value = options[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function option_string(field: CmsField, ...keys: string[]): string {
  const value = option_value(field, ...keys);
  return value === undefined ? "" : String(value);
}

export function option_bool(
  field: CmsField,
  fallback: boolean,
  ...keys: string[]
): boolean {
  const value = option_value(field, ...keys);
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return !["false", "0", "off", "no"].includes(String(value).toLowerCase());
}

export function option_number(
  field: CmsField,
  fallback: number,
  ...keys: string[]
): number {
  const value = option_value(field, ...keys);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function option_array(
  field: CmsField,
  ...keys: string[]
): unknown[] {
  const value = option_value(field, ...keys);
  return Array.isArray(value) ? value : [];
}

export function field_choices(field: CmsField): CmsChoice[] {
  return cms_normalize_choices(field.options?.choices);
}

export function is_status_field(field: CmsField): boolean {
  return (
    field.name === "status" &&
    field.type === "select" &&
    field_choices(field).some(
      (choice) => String(choice.value).toLowerCase() === "draft"
    )
  );
}

export function is_system_sort_field(field: CmsField): boolean {
  return (
    field.options?._eterc_system_field === "sort" ||
    (field.name === "sort" &&
      field.type === "integer" &&
      field.interface === "number")
  );
}

export function field_interface(field: CmsField): CmsFieldInterface {
  return field.interface || cms_field_interface(field.type);
}

export function as_string(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export function as_string_array(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => as_string(entry)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map((entry) => as_string(entry));
    } catch {
      return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export function as_object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function as_array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function parse_json_value<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return fallback;
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return fallback;
    }
  }
  return (value as T) ?? fallback;
}

export function related_collection(field: CmsField): string {
  return option_string(
    field,
    "relatedCollection",
    "related_collection",
    "rel_collection",
    "collection",
    "selectedCollection",
    "selected_collection"
  );
}

export function display_template(field: CmsField): string {
  return option_string(field, "template", "display_template");
}

export interface CollectionLabelSource {
  primary_key?: string;
  display_template?: string;
  fields?: CmsField[];
}

export function item_primary_key(
  collection: CollectionLabelSource | null | undefined
): string {
  return collection?.primary_key || "id";
}

function template_tokens(template: string, row: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = row[key];
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return "";
    return String(value);
  });
}

/** Build a human label for a related record. */
export function item_label(
  row: Record<string, unknown>,
  collection: CollectionLabelSource | null | undefined,
  fallbackTemplate = ""
): string {
  const template = fallbackTemplate || collection?.display_template || "";
  if (template) {
    const label = template_tokens(template, row).trim();
    if (label) return label;
  }
  const pk = item_primary_key(collection);
  const fields = collection?.fields ?? [];
  const candidates = fields.filter(
    (entry) =>
      entry.type !== "alias" &&
      entry.name !== pk &&
      entry.type !== "image" &&
      entry.type !== "json" &&
      entry.type !== "relation"
  );
  for (const candidate of candidates) {
    const value = row[candidate.name];
    if (typeof value === "string" && value.trim() !== "") return value;
    if (typeof value === "number") return String(value);
  }
  const id = row[pk];
  return id === null || id === undefined || id === "" ? "Untitled" : `#${String(id)}`;
}

export function choice_label(choices: CmsChoice[], value: unknown): string {
  const found = choices.find(
    (choice) => String(choice.value) === String(value)
  );
  return found ? found.text : as_string(value);
}

export function choice_value_from_text(
  field: CmsField,
  text: string
): string | number | boolean {
  const trimmed = text.trim();
  if (field.type === "integer" || field.type === "relation") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : trimmed;
  }
  if (field.type === "decimal") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : trimmed;
  }
  if (field.type === "boolean") {
    return ["true", "1", "yes", "on"].includes(trimmed.toLowerCase());
  }
  return trimmed;
}

/**
 * Directus applies a field default when a record is created. JSON interfaces
 * receive an empty array/object so their editor always has a stable shape.
 */
export function default_value_for_field(field: CmsField): unknown {
  const configured = field.options?.default;
  if (configured !== undefined && configured !== null && configured !== "") {
    if (field.type === "json" && typeof configured === "string") {
      try {
        return JSON.parse(configured) as unknown;
      } catch {
        return configured;
      }
    }
    return configured;
  }

  const iface = field_interface(field);
  switch (iface) {
    case "tags":
    case "checkboxes":
    case "checkboxes_tree":
    case "dropdown_multiselect":
    case "files":
    case "builder_m2a":
    case "many_to_many":
    case "one_to_many":
    case "repeater":
      return [];
    case "translations":
      return {};
    case "map": {
      const lat = option_number(field, 0, "defaultLat", "default_lat");
      const lng = option_number(field, 0, "defaultLng", "default_lng");
      return {
        type: option_string(field, "geometryType", "geometry_type") || "Point",
        coordinates: [lng, lat],
      };
    }
    case "toggle":
      return false;
    case "slider":
      return option_number(field, 0, "minValue", "min");
    case "color":
    case "icon":
    case "hash":
      return "";
    case "file":
    case "image":
    case "many_to_one":
    case "tree_view":
    case "collection_item_dropdown":
    case "relation":
      return "";
    default:
      return "";
  }
}

export function is_presentation_field(field: CmsField): boolean {
  return cms_interface_definition(field.interface).presentation === true;
}

export function is_group_field(field: CmsField): boolean {
  return cms_interface_definition(field.interface).groupInterface === true;
}

export function is_alias_field(field: CmsField): boolean {
  return field.type === "alias" || cms_interface_definition(field.interface).alias === true;
}
