import type { ReactNode } from "react";
import { Trongate, prepareController, type ControllerCtor } from "./controller";
import { controllerLoaders } from "./registrations";
import { DEFAULT_METHOD, DEFAULT_MODULE, CUSTOM_ROUTES } from "./config";
import { TgHttpError } from "./signals";
import type { ValidationService } from "./validation";

/**
 * Router — port of engine/Core.php route resolution.
 * URLs are addressed as {module}/{method}/{params...} exactly like the PHP
 * original; controllers are TypeScript classes registered in registrations.ts.
 */

export interface RouteTarget {
  module: string;
  method: string;
  params: string[];
}

export interface DispatchResult {
  node: ReactNode;
  rawReturn: unknown;
  controller?: Trongate;
  validation?: ValidationService;
}

const VALID_SEGMENT = /^[a-z0-9_-]+$/i;

/** Apply custom routes and split {module}/{method}/{params}. */
export function resolveRoute(segments: string[]): RouteTarget {
  let working = [...segments];

  if (working.length > 0 && CUSTOM_ROUTES[working[0]]) {
    const mapped = CUSTOM_ROUTES[working[0]].split("/").filter(Boolean);
    working = [...mapped, ...working.slice(1)];
  }

  const module = (working[0] || DEFAULT_MODULE).toLowerCase();
  const method = (working[1] || DEFAULT_METHOD).toLowerCase();
  const params = working.slice(2);

  if (!VALID_SEGMENT.test(module) || !VALID_SEGMENT.test(method)) {
    throw new TgHttpError(404, "Invalid route");
  }

  return { module, method, params };
}

/** Instantiate a module controller (with framework services prepared). */
export async function loadController(moduleName: string): Promise<Trongate> {
  const loader = controllerLoaders[moduleName];
  if (!loader) {
    throw new TgHttpError(404, `Module '${moduleName}' not found`);
  }
  const moduleExports = await loader();
  const Ctor = moduleExports.default;
  const controller = new Ctor(moduleName);
  return prepareController(controller, moduleName);
}

/** Dispatch a resolved route to its controller method. */
export async function dispatch(segments: string[]): Promise<DispatchResult> {
  const { module, method } = resolveRoute(segments);
  const controller = await loadController(module);

  const handler = (controller as unknown as Record<string, unknown>)[method];
  if (
    method.startsWith("_") ||
    method === "constructor" ||
    typeof handler !== "function"
  ) {
    throw new TgHttpError(404, `Method '${method}' not found in module '${module}'`);
  }

  const rawReturn = await (handler as () => unknown).call(controller);

  return {
    node: (rawReturn ?? null) as ReactNode,
    rawReturn,
    controller,
    validation: controller.validation,
  };
}
