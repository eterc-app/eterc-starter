import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR, PROJECT_ROOT } from "@/engine/paths";
import { EtHttpError } from "@/engine/signals";
import type { CmsProjectSettings } from "./cms-types";

const PROJECT_FILE = path.join(DATA_DIR, "settings", "project.json");
const DEFAULT_DESCRIPTOR = "CMS workspace";
const DEFAULT_LANGUAGE = "en-US";

const LANGUAGES = new Set(["en-US", "en-GB", "fr-FR", "de-DE"]);

interface PackageIdentity {
  name?: string;
  etercProjectName?: string;
}

interface ProjectDefaults {
  owner?: string;
  url?: string;
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function package_identity(): PackageIdentity {
  try {
    const raw = fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return is_record(parsed) ? (parsed as PackageIdentity) : {};
  } catch {
    return {};
  }
}

function safe_url(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fallback;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

function required_url(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new EtHttpError(400, "Project URL must be a valid http(s) URL.");
  }
}

function defaults(overrides: ProjectDefaults = {}): CmsProjectSettings {
  const identity = package_identity();
  return {
    name:
      text(identity.etercProjectName, "", 80) ||
      text(identity.name, "", 80) ||
      "Eterc project",
    descriptor: DEFAULT_DESCRIPTOR,
    url: safe_url(overrides.url, ""),
    owner: text(overrides.owner, "", 160),
    language: DEFAULT_LANGUAGE,
  };
}

function normalize(
  value: unknown,
  fallback: CmsProjectSettings
): CmsProjectSettings {
  const record = is_record(value) ? value : {};
  const language = text(record.language, fallback.language, 16);
  return {
    name: text(record.name, fallback.name, 80) || fallback.name,
    descriptor: text(record.descriptor, fallback.descriptor, 140),
    url: safe_url(record.url, fallback.url),
    owner: text(record.owner, fallback.owner, 160),
    language: LANGUAGES.has(language) ? language : fallback.language,
  };
}

function read_stored(): unknown {
  try {
    if (!fs.existsSync(PROJECT_FILE)) return null;
    return JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8")) as unknown;
  } catch {
    return null;
  }
}

/** Current project identity, falling back to package.json and request hints. */
export function get_cms_project_settings(
  defaultsInput: ProjectDefaults = {}
): CmsProjectSettings {
  return normalize(read_stored(), defaults(defaultsInput));
}

/**
 * Persist project identity. The values are public UI labels, not secrets, but
 * they are validated so a malformed URL or control characters cannot reach
 * the admin shell.
 */
export function save_cms_project_settings(
  value: unknown,
  defaultsInput: ProjectDefaults = {}
): CmsProjectSettings {
  const fallback = get_cms_project_settings(defaultsInput);
  const record = is_record(value) ? value : {};
  const name =
    record.name === undefined ? fallback.name : text(record.name, "", 80);
  if (!name) throw new EtHttpError(400, "Project name is required.");
  const language =
    record.language === undefined
      ? fallback.language
      : text(record.language, fallback.language, 16);
  if (!LANGUAGES.has(language)) {
    throw new EtHttpError(400, "Choose a supported project language.");
  }

  const next: CmsProjectSettings = {
    name,
    descriptor:
      record.descriptor === undefined
        ? fallback.descriptor
        : text(record.descriptor, "", 140),
    url:
      record.url === undefined ? fallback.url : required_url(record.url),
    owner:
      record.owner === undefined
        ? fallback.owner
        : text(record.owner, "", 160),
    language,
  };

  fs.mkdirSync(path.dirname(PROJECT_FILE), { recursive: true });
  const temp = `${PROJECT_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temp, PROJECT_FILE);
  return next;
}
