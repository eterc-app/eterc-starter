import { Db } from "./db";
import { Model } from "./model";
import { Validation } from "./Validation";
import { Eterc_tokens } from "./Eterc_tokens";
import { Templates } from "./Templates";

type SyncFactory = (controller: Eterc) => unknown;

const syncFactories = new Map<string, SyncFactory>();

/** Register a synchronously-available service/controller (called at boot). */
export function register_sync_service(name: string, factory: SyncFactory): void {
  syncFactories.set(name, factory);
}

/** Constructor shape of a module controller. */
export type ControllerCtor = new (moduleName?: string | null) => Eterc;

export class Eterc {
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
  private instances: Record<string, unknown> = {};

  /**
   * Load another module's controller asynchronously:
   *   const login = await this.module("login");
   */
  async module<T = Eterc>(name: string): Promise<T> {
    const key = name.toLowerCase();
    if (this.instances[key]) return this.instances[key] as T;

    const { load_controller } = await import("./router");
    const instance = await load_controller(key);
    this.instances[key] = instance;
    return instance as T;
  }
  async view(name: string, data: Record<string, unknown> = {}) {
    return this.templates.view(name, data);
  }
  static create_proxy<T extends Eterc>(controller: T): T {
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
        if (prop === "eterc_tokens") {
          const service = new Eterc_tokens();
          if (cached) cached[prop] = service;
          return service;
        }

        return undefined;
      },
    });
  }
}

/** Wire the standard framework services onto a freshly created controller. */
export function prepare_controller(controller: Eterc, moduleName: string): Eterc {
  controller.db = new Db(moduleName);
  const validation = new Validation();
  validation.set_caller(controller);
  controller.validation = validation;
  controller.templates = templates_service;
  if (!controller.model) {
    controller.model = new Model(moduleName);
  }
  return Eterc.create_proxy(controller);
}

export const templates_service = new Templates();
