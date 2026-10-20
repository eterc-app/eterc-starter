import { getContext, type TgRequest, type TgUploadedFile } from "./request-context";

/**
 * post() / get_param() — ports of the input helpers.
 *
 * post(field) reads from the parsed request body (FormData or JSON) supporting
 * PHP-style `user[profile][name]`, `user.profile.name` and `list[]` names.
 * Missing fields return '' exactly like the PHP helper.
 */

const parsedCache = new WeakMap<TgRequest, Record<string, unknown>>();

function formDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [rawKey, value] of formData.entries()) {
    if (value instanceof File && value.size === 0 && value.name === "") {
      continue;
    }
    const path = parseKeyPath(rawKey);
    if (path.length === 0) continue;
    assignPath(result, path, value);
  }

  return result;
}

/** Parses `a[b][c]`, `a.b.c`, `list[]` into a path array. */
function parseKeyPath(key: string): Array<string | number> {
  const path: Array<string | number> = [];
  const bracketPattern = /^([^\[\]]*)((?:\[[^\]]*\])*)$/;
  const match = key.match(bracketPattern);
  if (!match) return key.split(".");

  const head = match[1];
  if (head !== "") path.push(...splitDots(head));

  const bracketPart = match[2];
  if (bracketPart) {
    const inner = bracketPart.match(/\[[^\]]*\]/g) ?? [];
    for (const part of inner) {
      const value = part.slice(1, -1);
      path.push(value === "" ? -1 : value);
    }
  }

  return path;
}

function splitDots(value: string): string[] {
  return value.split(".").filter((p) => p !== "");
}

function assignPath(
  target: Record<string, unknown>,
  path: Array<string | number>,
  value: unknown
): void {
  let current: Record<string | number, unknown> = target as Record<string | number, unknown>;
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    const isLast = i === path.length - 1;

    if (key === -1) {
      // `list[]` — append to an array.
      const parentKey = path[i - 1];
      if (typeof parentKey !== "string" && typeof parentKey !== "number") return;
      const parent = current[parentKey];
      if (Array.isArray(parent)) {
        parent.push(value);
      } else {
        current[parentKey] = [value];
      }
      return;
    }

    if (isLast) {
      current[key] = value;
      return;
    }

    const next = current[key];
    if (next === undefined || typeof next !== "object" || next === null) {
      current[key] = {};
    }
    current = current[key] as Record<string | number, unknown>;
  }
}

function bodyObject(): Record<string, unknown> {
  const ctx = getContext();
  const cached = parsedCache.get(ctx);
  if (cached) return cached;

  let parsed: Record<string, unknown> = {};
  if (ctx.formData) {
    parsed = formDataToObject(ctx.formData);
  } else if (ctx.json && typeof ctx.json === "object") {
    parsed = ctx.json as Record<string, unknown>;
  }

  parsedCache.set(ctx, parsed);
  return parsed;
}

function readPath(source: Record<string, unknown>, field: string): unknown {
  if (field in source) return source[field];

  const normalized = field.replace(/\./g, "\x00");
  const direct = parseKeyPath(field.includes("[") ? field : normalized.replace(/\x00/g, "["));
  if (direct.length === 0) return undefined;

  let current: unknown = source;
  for (const part of direct) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      current = Number.isNaN(index) ? undefined : current[index];
    } else if (typeof current === "object") {
      const obj = current as Record<string | number, unknown>;
      if (obj[part] === undefined && part !== -1) {
        // Try a dotted key literal (e.g. form name "user.profile.name")
        if (typeof part === "string") {
          const dottedValue = (source as Record<string, unknown>)[part];
          if (dottedValue !== undefined) {
            current = undefined;
            return dottedValue;
          }
        }
        return undefined;
      }
      current = obj[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Retrieve a posted field.
 *
 * @param field      The field name (supports dot/bracket notation).
 * @param cleanUp    Trim + collapse whitespace on string values.
 * @param castNumeric Convert numeric strings to numbers.
 */
export function post(
  field: string,
  cleanUp = false,
  castNumeric = false
): string | number | boolean | string[] | number[] | unknown {
  const ctx = getContext();
  const source = bodyObject();
  let value = readPath(source, field);

  if (value === undefined || value === null) {
    // JSON bodies can nest dotted keys naturally.
    if (ctx.json && typeof ctx.json === "object") {
      value = readPath(ctx.json as Record<string, unknown>, field);
    }
  }

  if (value === undefined || value === null) return "";

  if (typeof value === "string") {
    let str = value;
    if (cleanUp) {
      str = str.replace(/\s+/g, " ").trim();
    }
    if (castNumeric && isNumeric(str)) {
      return str.includes(".") ? parseFloat(str) : parseInt(str, 10);
    }
    return cleanUp ? str : value;
  }

  return value;
}

function isNumeric(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim()) && value.trim() !== "";
}

/** Query-string parameter access. */
export function getParam(field: string): string {
  const ctx = getContext();
  const value = ctx.query[field];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** True when the request body contains at least one field. */
export function hasPost(): boolean {
  return Object.keys(bodyObject()).length > 0;
}

/** List uploaded files from the request body (mirrors $_FILES access). */
export async function uploadedFile(field: string): Promise<TgUploadedFile | null> {
  const ctx = getContext();
  if (!ctx.formData) return null;

  const value = ctx.formData.get(field);
  if (!(value instanceof File)) return null;

  const buffer = Buffer.from(await value.arrayBuffer());
  return {
    fieldName: field,
    originalName: value.name,
    mimeType: value.type || "application/octet-stream",
    size: value.size,
    bytes: buffer,
  };
}

/** All uploaded files keyed by field name. */
export async function uploadedFiles(): Promise<Record<string, TgUploadedFile>> {
  const ctx = getContext();
  const result: Record<string, TgUploadedFile> = {};
  if (!ctx.formData) return result;

  for (const [key, value] of ctx.formData.entries()) {
    if (value instanceof File && value.size > 0 && value.name !== "") {
      result[key] = {
        fieldName: key,
        originalName: value.name,
        mimeType: value.type || "application/octet-stream",
        size: value.size,
        bytes: Buffer.from(await value.arrayBuffer()),
      };
    }
  }
  return result;
}
