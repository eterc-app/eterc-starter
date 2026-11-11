import type { CmsCollectionWithFields, CmsField } from "@/modules/cms/cms-types";

export function parse_csv(source: string): string[][] {
  const content = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("The CSV file contains an unclosed quoted field.");
  if (value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => cell.trim() !== ""));
}

export function import_field_value(field: CmsField, value: string): unknown {
  if (value === "") return "";
  if (field.type === "json") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new Error(`"${field.label || field.name}" must contain valid JSON.`);
    }
  }
  if (field.type === "boolean") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    throw new Error(`"${field.label || field.name}" must be true or false.`);
  }
  if (field.type === "integer" || field.type === "relation") {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`"${field.label || field.name}" must be an integer.`);
    }
    return parsed;
  }
  if (field.type === "decimal") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`"${field.label || field.name}" must be a number.`);
    }
    return parsed;
  }
  return value;
}

export function csv_cell(value: unknown): string {
  const text =
    value !== null && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
  const safeText =
    typeof value === "string" && /^[=+\-@]/.test(value.trimStart())
      ? `'${text}`
      : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function download_text(
  contents: string,
  type: string,
  filename: string
): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function collection_schema(collections: CmsCollectionWithFields[]) {
  return {
    exported_at: new Date().toISOString(),
    collections: collections.map((item) => ({
      name: item.name,
      label: item.label,
      primary_key: item.primary_key,
      ordering_mode: item.ordering_mode,
      default_order: item.default_order,
      fields: item.fields.map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        interface: field.interface,
        required: field.required,
        unique: field.unique,
        hidden: field.hidden,
        readonly: field.readonly,
        clear_hidden_value_on_save: field.clear_hidden_value_on_save,
        group: field.group,
        options: field.options,
      })),
    })),
  };
}
