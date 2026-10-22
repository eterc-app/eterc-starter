import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { run_with_context, type EtRequest } from "./request-context";
import { dispatch } from "./router";
import { templates_service } from "./controller";
import { EtHttpError } from "./signals";
import { flash_messages } from "./Flashdata";
import { csrf_token } from "./csrf";
import { resolve_public_route } from "./url-aliases";
import { ErrorPage } from "@/templates/Error404";
import type { ValidationErrors } from "./Validation";
import "@/modules/views";

/**
 * Dispatcher — builds the request-scoped context (replacing PHP superglobals)
 * and runs controllers inside it. Shared by page renders, server actions and
 * the JSON API.
 */

export interface EtRequestOptions {
  segments: string[];
  /** Original URL segments, when they differ from the resolved module path. */
  publicSegments?: string[];
  query?: Record<string, string | string[]>;
  formData?: FormData;
  json?: unknown;
  isAjax?: boolean;
  canSetCookies?: boolean;
  method?: string;
}

export interface EtRunResult {
  node: ReactNode;
  rawReturn: unknown;
  errors: ValidationErrors | null;
  flash: string[];
  csrf_token: string;
  status: number;
}

export async function build_request(options: EtRequestOptions): Promise<EtRequest> {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const cookieMap: Record<string, string> = {};
  for (const cookie of cookieStore.getAll()) {
    cookieMap[cookie.name] = cookie.value;
  }

  const host = headerStore.get("host") ?? "localhost";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const publicSegments = options.publicSegments ?? options.segments;
  const pathname = "/" + publicSegments.map(encodeURIComponent).join("/");

  const query = options.query ?? {};
  const queryString = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) =>
      Array.isArray(value)
        ? value.map((entry): [string, string] => [key, entry])
        : [[key, String(value)] as [string, string]]
    )
  ).toString();

  return {
    segments: options.segments,
    httpMethod: options.method ?? (options.formData || options.json !== undefined ? "POST" : "GET"),
    formData: options.formData,
    json: options.json,
    url: `${proto}://${host}${pathname}${queryString ? `?${queryString}` : ""}`,
    pathname,
    query,
    headers: headerStore,
    cookies: cookieMap,
    isAjax: options.isAjax ?? false,
    canSetCookies: options.canSetCookies ?? false,
    responseCookies: [],
    flashBuffer: [],
  };
}

/**
 * Run the dispatcher inside an already-established context.
 * Converts framework errors into rendered nodes (PHP parity). Redirect
 * signals are rethrown for the caller (page/action/api) to handle.
 */
export async function run_in_context(options: EtRequestOptions): Promise<EtRunResult> {
  let node: ReactNode = null;
  let rawReturn: unknown = null;
  let status = 200;
  let validation: { errors: ValidationErrors } | undefined;

  try {
    const result = await dispatch(options.segments);
    node = result.node;
    rawReturn = result.rawReturn;
    validation = result.validation;
  } catch (error) {
    if (error instanceof EtHttpError) {
      status = error.status;
      node =
        error.status === 404
          ? await templates_service.error_404()
          : <ErrorPage status={error.status} message={error.message} />;
    } else {
      throw error;
    }
  }

  const errors =
    validation && Object.keys(validation.errors).length > 0 ? validation.errors : null;

  return {
    node,
    rawReturn,
    errors,
    flash: flash_messages(),
    csrf_token: csrf_token(),
    status,
  };
}

/** Build a context, run the request, and return the framework result. */
export async function run_request(options: EtRequestOptions): Promise<EtRunResult> {
  const publicSegments = options.segments;
  const requestOptions: EtRequestOptions = {
    ...options,
    segments: resolve_public_route(publicSegments),
    publicSegments,
  };
  const context = await build_request(requestOptions);
  return run_with_context(context, () => run_in_context(requestOptions));
}

/** Apply response cookies collected during the request (actions/route handlers). */
export async function flush_response_cookies(context: EtRequest): Promise<void> {
  if (!context.canSetCookies || context.responseCookies.length === 0) return;
  const jar = await cookies();
  for (const cookie of context.responseCookies) {
    jar.set(
      cookie.name,
      cookie.value,
      (cookie.options ?? {}) as Parameters<typeof jar.set>[2]
    );
  }
}
