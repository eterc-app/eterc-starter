import * as fs from "node:fs";
import * as path from "node:path";
import { MODULES_DIR } from "./paths";
import { EtHttpError } from "./signals";
import {
  Eterc_tokens,
  type EtercUserObj,
} from "./Eterc_tokens";

/**
 * Helpers for the public JSON API.
 *
 * Controllers exposed through `/api/v1/{resource}/{method}` live in modules
 * whose folder/class name ends with `_api` (for example `system_api`). This
 * keeps the public API opt-in: ordinary page controllers are never exposed by
 * accident.
 */

/**
 * Optional return wrapper for JSON API controllers.
 *
 * A controller may return a plain value (200 OK) or wrap it to control the
 * HTTP status/headers. The API route recognizes this class and writes the
 * response directly instead of applying the default 200 status.
 */
export class EtApiResponse {
  body: unknown;
  status: number;
  headers?: HeadersInit;

  constructor(body: unknown, status = 200, headers?: HeadersInit) {
    this.body = body;
    this.status = status;
    this.headers = headers;
  }
}

/** Require a valid administrator token/session and return its user object. */
export function require_api_user(level = 1): EtercUserObj {
  const tokens = new Eterc_tokens();
  const token = tokens.attempt_get_valid_token(level);

  if (!token) {
    throw new EtHttpError(
      401,
      "A valid administrator token is required. Sign in to the control panel or send an EtercToken header."
    );
  }

  const user = tokens.get_user_obj(token);
  if (!user) {
    throw new EtHttpError(401, "The supplied administrator token is not valid.");
  }

  return user;
}

/** Wrap an API payload to choose a non-200 status and/or response headers. */
export function api_response(
  body: unknown,
  status = 200,
  headers?: HeadersInit
): EtApiResponse {
  return new EtApiResponse(body, status, headers);
}

export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, unknown>>;
  components?: Record<string, unknown>;
  security?: Array<Record<string, string[]>>;
}

const API_SPEC_FILE = "api.json";

/**
 * The base document is always present. Individual modules can contribute
 * paths/components/tags through `{module}/assets/api.json`, which mirrors the
 * per-module API settings used by the original framework's API explorer.
 */
const BASE_DOCUMENT: OpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Eterc API",
    version: process.env.npm_package_version ?? "0.1.0",
    description:
      "JSON API for the current Eterc project. The documentation below is generated from src/modules/*/assets/api.json and is served by Scalar. Requests sent from the signed-in desktop control panel use its session automatically; external clients can send an EtercToken header.",
  },
  servers: [
    {
      url: "/",
      description: "Current Eterc project",
    },
  ],
  tags: [],
  paths: {},
  components: {
    securitySchemes: {
      adminToken: {
        type: "apiKey",
        in: "header",
        name: "EtercToken",
        description:
          "Administrator token. The control-panel session is accepted too, so requests sent from Scalar inside the signed-in desktop app work without pasting a token.",
      },
    },
  },
};

function is_object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function merge_objects(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(source)) {
    if (key === "tags") continue;
    if (is_object(value) && is_object(target[key])) {
      merge_objects(target[key] as Record<string, unknown>, value);
      continue;
    }
    target[key] = value;
  }
}

function find_api_specs(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];

  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;

    const moduleDirectory = path.join(directory, entry.name);
    const specPath = path.join(moduleDirectory, "assets", API_SPEC_FILE);
    if (fs.existsSync(specPath)) found.push(specPath);

    found.push(...find_api_specs(moduleDirectory));
  }

  return found;
}

/** Build the OpenAPI document, merging every module's optional api.json. */
export function build_openapi_document(): OpenApiDocument {
  const document = structuredClone(BASE_DOCUMENT);
  const tags = new Map<string, { name: string; description?: string }>();

  for (const specPath of find_api_specs(MODULES_DIR)) {
    let fragment: unknown;
    try {
      fragment = JSON.parse(fs.readFileSync(specPath, "utf8"));
    } catch (error) {
      console.warn(
        `[eterc] Ignoring invalid API specification ${specPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      continue;
    }

    if (!is_object(fragment)) continue;

    merge_objects(
      document as unknown as Record<string, unknown>,
      fragment
    );

    if (Array.isArray(fragment.tags)) {
      for (const tag of fragment.tags) {
        if (!is_object(tag) || typeof tag.name !== "string") continue;
        tags.set(tag.name, {
          name: tag.name,
          ...(typeof tag.description === "string"
            ? { description: tag.description }
            : {}),
        });
      }
    }
  }

  document.tags = [...tags.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  document.paths = Object.fromEntries(
    Object.entries(document.paths).sort(([a], [b]) => a.localeCompare(b))
  );

  return document;
}
