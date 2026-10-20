import { Db } from "./db";
import { Model } from "./model";
import { Validation } from "./Validation";
import { Trongate_tokens } from "./Trongate_tokens";
import { Templates } from "./Templates";

/**
 * Trongate base controller — port of engine/Trongate.php.
 *
 * Controllers extend this class and lazily reach framework modules/properties
 * exactly like the PHP original (`this.db`, `this.validation`, `this.model`,
 * `this.templates`, `this.trongate_tokens`, ...).
 *
 * Unknown properties resolve through the synchronously-registered service
 * factories (see register_sync_service) with a lazy per-request cache.
 */

type SyncFactory = (controller: Trongate) => unknown;

const syncFactories = new Map<string, SyncFactory>();

/** Register a synchronously-available service/controller (called at boot). */
export function register_sync_service(name: string, factory: SyncFactory): void {
  syncFactories.set(name, factory);
}

/** Constructor shape of a ported module controller. */
export type ControllerCtor = new (moduleName?: string | null) => Trongate;

export class Trongate {
  /** PHP-style dynamic property access (module instances, services, ...). */
  [key: string]: unknown;

  protected module_name: string;
  parent_module = "";
  child_module = "";

  db!: Db;
  validation!: Validation;
  model!: Model;
  templates!: Templates;

  constructor(moduleName?: string | null) {
    this.module_name = moduleName ?? "";
  }

  /** Auto-loaded modules cache (mirrors PHP's $instances array). */
  private instances: Record<string, unknown> = {};

  /**
   * Load another module's controller asynchronously:
   *   const login = await this.module("login");
   */
  async module<T = Trongate>(name: string): Promise<T> {
    const key = name.toLowerCase();
    if (this.instances[key]) return this.instances[key] as T;

    const { load_controller } = await import("./router");
    const instance = await load_controller(key);
    this.instances[key] = instance;
    return instance as T;
  }

  /**
   * The PHP framework returns view markup as strings. In this port the
   * equivalent helper composes React views:
   *   return this.view("welcome/default_homepage", data);
   */
  async view(name: string, data: Record<string, unknown> = {}) {
    return this.templates.view(name, data);
  }

  /**
   * Resolve properties not declared on the subclass through the sync service
   * registry — the equivalent of PHP's __get() auto-loading.
   */
  static create_proxy<T extends Trongate>(controller: T): T {
    return new Proxy(controller, {
      get(target, prop, receiver) {
        if (typeof prop === "symbol") {
          return Reflect.get(target, prop, receiver);
        }

        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        }

        const cached = (target as unknown as { instances?: Record<string, unknown> }).instances;
        if (cached && prop in cached) return cached[prop];

        const factory = syncFactories.get(prop);
        if (factory) {
          const service = factory(target);
          if (cached) cached[prop] = service;
          return service;
        }

        // Well-known framework singleton.
        if (prop === "trongate_tokens") {
          const service = new Trongate_tokens();
          if (cached) cached[prop] = service;
          return service;
        }

        return undefined;
      },
    });
  }
}

/** Wire the standard framework services onto a freshly created controller. */
export function prepare_controller(controller: Trongate, moduleName: string): Trongate {
  controller.db = new Db(moduleName);
  const validation = new Validation();
  validation.set_caller(controller);
  controller.validation = validation;
  controller.templates = templates_service;
  if (!controller.model) {
    controller.model = new Model(moduleName);
  }
  return Trongate.create_proxy(controller);
}

export const templates_service = new Templates();
