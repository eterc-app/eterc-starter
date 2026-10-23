import { NextRequest, NextResponse, connection } from "next/server";
import {
  build_request,
  flush_response_cookies,
} from "@/engine/dispatch";
import { controllerLoaders } from "@/engine/registrations";
import { run_with_context } from "@/engine/request-context";
import { dispatch } from "@/engine/router";
import { EtApiResponse } from "@/engine/api";
import { EtHttpError, EtRedirectSignal } from "@/engine/signals";
import type { ControllerCtor } from "@/engine/controller";

const RESOURCE_PATTERN = /^[a-z][a-z0-9_-]*$/i;
const METHOD_PATTERN = /^[a-z_][a-z0-9_-]*$/i;

/**
 * Built-in API controllers are also loadable when a project predates the
 * registrations entry (for example, a project upgraded by Eterc Desktop).
 */
const BUILT_IN_API_CONTROLLERS: Record<
  string,
  () => Promise<{ default: ControllerCtor }>
> = {
  system_api: () => import("@/modules/system_api/System_api"),
  cms_api: () => import("@/modules/cms_api/Cms_api"),
};

interface RouteContext {
  params: Promise<{ segments?: string[] }>;
}

interface RequestBody {
  json?: unknown;
  formData?: FormData;
}

async function read_body(
  request: NextRequest,
  method: string
): Promise<RequestBody> {
  if (method === "GET" || method === "HEAD") return {};

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return { json: await request.json() };
    } catch {
      throw new EtHttpError(400, "The request body is not valid JSON.");
    }
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    return { formData: await request.formData() };
  }

  return {};
}

function error_response(error: unknown, status: number) {
  return NextResponse.json(
    {
      error:
        error instanceof Error ? error.message : "The request could not be processed.",
    },
    { status }
  );
}

async function handle(
  request: NextRequest,
  context: RouteContext,
  method: string
): Promise<Response> {
  // This endpoint is always request-scoped (cookies, headers and DB access).
  await connection();

  const { segments = [] } = await context.params;
  const clean = segments.filter(Boolean);

  if (clean.length < 2) {
    return error_response(
      new Error(
        "Use /api/v1/{resource}/{method}. API controllers live in a module whose name ends with _api."
      ),
      404
    );
  }

  const [resource, methodName, ...params] = clean;
  if (
    !RESOURCE_PATTERN.test(resource) ||
    !METHOD_PATTERN.test(methodName) ||
    methodName.startsWith("_")
  ) {
    return error_response(new Error("Invalid API route."), 404);
  }

  const moduleName = `${resource.toLowerCase()}_api`;
  const loader =
    controllerLoaders[moduleName] ?? BUILT_IN_API_CONTROLLERS[moduleName];
  if (!loader) {
    return error_response(
      new Error(`API resource '${resource}' was not found.`),
      404
    );
  }
  if (!controllerLoaders[moduleName]) {
    controllerLoaders[moduleName] = loader;
  }

  let body: RequestBody;
  try {
    body = await read_body(request, method);
  } catch (error) {
    return error_response(error, 400);
  }

  const query: Record<string, string | string[]> = {};
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      query[key] = [existing, value];
    }
  }

  const options = {
    segments: [moduleName, methodName.toLowerCase(), ...params],
    publicSegments: ["api", "v1", ...clean],
    query,
    ...body,
    isAjax: true,
    canSetCookies: true,
    method,
  };

  try {
    const requestContext = await build_request(options);
    const result = await run_with_context(requestContext, () =>
      dispatch(options.segments)
    );
    await flush_response_cookies(requestContext);

    if (result.validation && Object.keys(result.validation.errors).length > 0) {
      return NextResponse.json(
        {
          error: "Validation failed.",
          errors: result.validation.errors,
        },
        { status: 422 }
      );
    }

    const payload = result.rawReturn;
    if (payload instanceof EtApiResponse) {
      return NextResponse.json(payload.body ?? null, {
        status: payload.status,
        headers: payload.headers,
      });
    }

    if (payload instanceof Response) return payload;

    return NextResponse.json(payload ?? null, { status: 200 });
  } catch (error) {
    if (error instanceof EtHttpError) {
      return error_response(error, error.status);
    }
    if (error instanceof EtRedirectSignal) {
      return error_response(
        new Error("A valid administrator session or token is required."),
        401
      );
    }

    console.error("[eterc] API request failed", error);
    return error_response(new Error("Internal server error."), 500);
  }
}

export function GET(request: NextRequest, context: RouteContext) {
  return handle(request, context, "GET");
}

export function POST(request: NextRequest, context: RouteContext) {
  return handle(request, context, "POST");
}

export function PUT(request: NextRequest, context: RouteContext) {
  return handle(request, context, "PUT");
}

export function PATCH(request: NextRequest, context: RouteContext) {
  return handle(request, context, "PATCH");
}

export function DELETE(request: NextRequest, context: RouteContext) {
  return handle(request, context, "DELETE");
}
