import { admin_login_path } from "@/engine/config";
import { Eterc } from "@/engine/controller";
import { set_flashdata } from "@/engine/Flashdata";
import { get_context } from "@/engine/request-context";
import { EtHttpError } from "@/engine/signals";
import { redirect, site_url } from "@/engine/Url";
import { require_admin_user } from "@/modules/cms/cms-access";
import { list_collections } from "@/modules/cms/cms-store";
import type { CmsPrincipal } from "@/modules/cms/cms-types";
import { OPERATION_DEFINITIONS } from "@/modules/flows/operation-catalog";
import { enqueue_flow_trigger } from "@/modules/flows/flow-queue";
import { flow_health, flow_runtime_mode } from "@/modules/flows/flow-runtime";
import { run_flow } from "@/modules/flows/flow-runner";
import { principal_from_cms } from "@/modules/flows/flow-principal";
import {
  create_flow,
  delete_flow,
  duplicate_flow,
  get_flow,
  get_flow_run,
  get_flow_with_operations,
  list_flow_run_steps,
  list_flow_runs,
  list_flows,
  rotate_flow_secret,
  save_flow_graph,
  update_flow_meta,
  update_flow_trigger,
} from "@/modules/flows/flow-store";
import type {
  FlowGraphInput,
} from "@/modules/flows/flow-validation";
import type {
  FlowAccountability,
  FlowStatus,
  FlowTrigger,
} from "@/modules/flows/flow-types";

function context() {
  return get_context();
}

function query_string(name: string): string | undefined {
  const value = context().query[name];
  return Array.isArray(value) ? value[0] : value;
}

function body(): Record<string, unknown> {
  const json = context().json;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    return json as Record<string, unknown>;
  }
  const formData = context().formData;
  if (formData) return Object.fromEntries(formData.entries()) as Record<string, unknown>;
  return {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function status_value(value: unknown, fallback: FlowStatus = "inactive"): FlowStatus {
  return value === "active" || value === "inactive" ? value : fallback;
}

function trigger_value(value: unknown): FlowTrigger {
  if (
    value === "event" ||
    value === "webhook" ||
    value === "schedule" ||
    value === "operation" ||
    value === "manual"
  ) {
    return value;
  }
  throw new EtHttpError(400, "Choose a valid trigger type.");
}

function accountability_value(value: unknown): FlowAccountability {
  if (value === "all" || value === "activity") return value;
  return null;
}

export default class Flows_admin extends Eterc {
  private async principal(): Promise<CmsPrincipal> {
    try {
      return await require_admin_user();
    } catch (error) {
      if (error instanceof EtHttpError && error.status === 401) {
        set_flashdata("Please sign in with an administrator account.");
        redirect(admin_login_path());
      }
      throw error;
    }
  }

  private origin(): string {
    try {
      return new URL(context().url).origin;
    } catch {
      return "";
    }
  }

  private admin_view(
    viewFile: string,
    pageTitle: string,
    data: Record<string, unknown>
  ) {
    return this.templates.admin({
      viewModule: "flows_admin",
      viewFile,
      pageTitle,
      ...data,
    });
  }

  private async collection_options() {
    return (await list_collections({ include_hidden: true }))
      .filter((collection) => !collection.system)
      .map((collection) => ({
        name: collection.name,
        label: collection.label || collection.name,
        primary_key: collection.primary_key,
      }));
  }

  private async flow_list_payload() {
    const runtime = flow_runtime_mode();
    const origin = this.origin();
    const health = await flow_health();
    return {
      flows: (await list_flows()).map((flow) => ({
        ...flow,
        webhook_url:
          flow.trigger === "webhook"
            ? `${origin}/api/flows/webhook/${flow.id}`
            : null,
      })),
      runtime,
      health: {
        ok: health.ok,
        ...health.flows,
      },
    };
  }

  async index() {
    const principal = await this.principal();
    const list = await this.flow_list_payload();
    return this.admin_view("index", "Flows", {
      principal,
      ...list,
      collections: await this.collection_options(),
    });
  }

  async builder() {
    const principal = await this.principal();
    const id = query_string("id") ?? "";
    if (!id) redirect(site_url("admin/flows"));
    const flow = await get_flow_with_operations(id);
    if (!flow) {
      set_flashdata("That flow no longer exists.");
      redirect(site_url("admin/flows"));
    }
    const runs = await list_flow_runs({ flow_id: id, limit: 20 });
    return this.admin_view("builder", flow.name, {
      principal,
      flow,
      flows: (await list_flows()).filter((entry) => entry.id !== id),
      collections: await this.collection_options(),
      catalog: OPERATION_DEFINITIONS,
      runs: runs.runs,
      runtime: flow_runtime_mode(),
      webhook_url:
        flow.trigger === "webhook"
          ? `${this.origin()}/api/flows/webhook/${flow.id}`
          : null,
      origin: this.origin(),
    });
  }

  async list_state() {
    await this.principal();
    return await this.flow_list_payload();
  }

  async flow_state() {
    await this.principal();
    const id = text(body().id) || query_string("id") || "";
    const flow = await get_flow_with_operations(id);
    if (!flow) throw new EtHttpError(404, "Flow not found.");
    return {
      flow,
      flows: (await list_flows()).filter((entry) => entry.id !== id),
      runs: (await list_flow_runs({ flow_id: id, limit: 20 })).runs,
      webhook_url:
        flow.trigger === "webhook"
          ? `${this.origin()}/api/flows/webhook/${flow.id}`
          : null,
    };
  }

  async create_flow() {
    const principal = await this.principal();
    const payload = body();
    const trigger = trigger_value(payload.trigger);
    const result = await create_flow({
      name: text(payload.name),
      description: text(payload.description),
      icon: text(payload.icon, "zap") || "zap",
      color: text(payload.color, "var(--foreground)") || "var(--foreground)",
      status: status_value(payload.status),
      trigger,
      options: object(payload.options),
      accountability: accountability_value(payload.accountability),
    });
    return {
      flow: result.flow,
      secret: result.secret,
      webhook_url:
        result.flow.trigger === "webhook"
          ? `${this.origin()}/api/flows/webhook/${result.flow.id}`
          : null,
      created_by: principal.user_id,
    };
  }

  async update_flow() {
    await this.principal();
    const payload = body();
    const id = text(payload.id);
    if (!id) throw new EtHttpError(400, "A flow id is required.");
    const flow = await update_flow_meta(id, {
      name: typeof payload.name === "string" ? payload.name : undefined,
      description:
        typeof payload.description === "string" ? payload.description : undefined,
      icon: typeof payload.icon === "string" ? payload.icon : undefined,
      color: typeof payload.color === "string" ? payload.color : undefined,
      status: payload.status === undefined ? undefined : status_value(payload.status),
      accountability:
        payload.accountability === undefined
          ? undefined
          : accountability_value(payload.accountability),
    });
    return { flow };
  }

  async update_trigger() {
    await this.principal();
    const payload = body();
    const id = text(payload.id);
    if (!id) throw new EtHttpError(400, "A flow id is required.");
    const result = await update_flow_trigger(
      id,
      trigger_value(payload.trigger),
      object(payload.options)
    );
    return {
      flow: result.flow,
      secret: result.secret,
      webhook_url:
        result.flow.trigger === "webhook"
          ? `${this.origin()}/api/flows/webhook/${result.flow.id}`
          : null,
    };
  }

  async save_graph() {
    await this.principal();
    const payload = body();
    const id = text(payload.id);
    if (!id) throw new EtHttpError(400, "A flow id is required.");
    const operations = array<Record<string, unknown>>(payload.operations)
      .filter((operation) => operation && typeof operation === "object")
      .map((operation) => ({
        id: text(operation.id) || undefined,
        name: text(operation.name),
        key: text(operation.key),
        type: text(operation.type),
        options: object(operation.options),
        position_x: Number(operation.position_x) || 0,
        position_y: Number(operation.position_y) || 0,
        resolve: operation.resolve ? String(operation.resolve) : null,
        reject: operation.reject ? String(operation.reject) : null,
      })) as FlowGraphInput[];
    const flow = await save_flow_graph(
      id,
      Number(payload.revision),
      operations,
      payload.root ? String(payload.root) : null
    );
    return { flow };
  }

  async set_status() {
    await this.principal();
    const payload = body();
    return {
      flow: await update_flow_meta(text(payload.id), {
        status: status_value(payload.status),
      }),
    };
  }

  async delete_flow() {
    await this.principal();
    await delete_flow(text(body().id));
    return { deleted: true };
  }

  async duplicate_flow() {
    await this.principal();
    return { flow: await duplicate_flow(text(body().id)) };
  }

  async rotate_secret() {
    await this.principal();
    const result = await rotate_flow_secret(text(body().id));
    return {
      flow: result.flow,
      secret: result.secret,
      webhook_url: `${this.origin()}/api/flows/webhook/${result.flow.id}`,
    };
  }

  async run_now() {
    const principal = await this.principal();
    const payload = body();
    const flow = await get_flow(text(payload.id));
    if (!flow) throw new EtHttpError(404, "Flow not found.");
    const input = payload.input ?? null;
    const collection = text(payload.collection);
    if (flow.trigger === "manual") {
      const options = flow.options as Record<string, unknown>;
      const collections = Array.isArray(options.collections)
        ? options.collections.map(String)
        : [];
      if (collections.length > 0 && collection && !collections.includes(collection)) {
        throw new EtHttpError(403, "This manual flow does not run for that collection.");
      }
    }
    const triggerPayload = {
      type: flow.trigger,
      body: input,
      manual: true,
      collection: collection || undefined,
      user: {
        id: principal.user_id,
        email: principal.user_email ?? null,
      },
    };
    if (flow.options.async === true && bool(payload.sync) === false) {
      const jobId = await enqueue_flow_trigger(flow.id, flow.trigger, triggerPayload);
      return { queued: true, job_id: jobId, flow_id: flow.id };
    }
    const result = await run_flow({
      flow,
      trigger: triggerPayload,
      principal: principal_from_cms(principal),
      allow_inactive: true,
    });
    return result;
  }

  async runs() {
    await this.principal();
    const payload = body();
    return await list_flow_runs({
      flow_id: text(payload.flow_id) || undefined,
      status: text(payload.status) || undefined,
      limit: Number(payload.limit) || 25,
      offset: Number(payload.offset) || 0,
    });
  }

  async run_detail() {
    await this.principal();
    const id = text(body().id);
    const run = await get_flow_run(id);
    if (!run) throw new EtHttpError(404, "Run not found.");
    return {
      run,
      steps: await list_flow_run_steps(id),
      flow: await get_flow(run.flow_id),
    };
  }

  async health_state() {
    await this.principal();
    return await flow_health();
  }

  async catalog_state() {
    await this.principal();
    return {
      catalog: OPERATION_DEFINITIONS,
      collections: await this.collection_options(),
      flows: (await list_flows()).map((flow) => ({
        id: flow.id,
        name: flow.name,
        trigger: flow.trigger,
        status: flow.status,
      })),
    };
  }

  async export_flow() {
    await this.principal();
    const flow = await get_flow_with_operations(text(body().id));
    if (!flow) throw new EtHttpError(404, "Flow not found.");
    return {
      version: 1,
      exported_at: new Date().toISOString(),
      flow: {
        name: flow.name,
        description: flow.description,
        icon: flow.icon,
        color: flow.color,
        status: "inactive",
        trigger: flow.trigger,
        options: flow.options,
        accountability: flow.accountability,
      },
      operations: flow.operations.map((operation) => ({
        id: operation.id,
        name: operation.name,
        key: operation.key,
        type: operation.type,
        options: operation.options,
        position_x: operation.position_x,
        position_y: operation.position_y,
        resolve: operation.resolve,
        reject: operation.reject,
      })),
      root: flow.operation,
    };
  }

  async import_flow() {
    await this.principal();
    const payload = body();
    const exported = object(payload.data);
    const flowInput = object(exported.flow);
    const operations = array<Record<string, unknown>>(exported.operations);
    const created = await create_flow({
      name: `${text(flowInput.name, "Imported flow")} (imported)`,
      description: text(flowInput.description),
      icon: text(flowInput.icon, "zap") || "zap",
      color: text(flowInput.color, "var(--foreground)") || "var(--foreground)",
      status: "inactive",
      trigger: trigger_value(flowInput.trigger),
      options: object(flowInput.options),
      accountability: accountability_value(flowInput.accountability),
    });
    if (operations.length > 0) {
      const map = new Map<string, string>();
      for (const operation of operations) {
        const oldId = text(operation.id);
        if (oldId) map.set(oldId, crypto.randomUUID());
      }
      await save_flow_graph(
        created.flow.id,
        1,
        operations.map((operation) => ({
          id: map.get(text(operation.id)),
          name: text(operation.name),
          key: text(operation.key),
          type: text(operation.type),
          options: object(operation.options),
          position_x: Number(operation.position_x) || 0,
          position_y: Number(operation.position_y) || 0,
          resolve: operation.resolve ? map.get(String(operation.resolve)) ?? null : null,
          reject: operation.reject ? map.get(String(operation.reject)) ?? null : null,
        })),
        exported.root ? map.get(String(exported.root)) ?? null : null
      );
    }
    return { flow: await get_flow(created.flow.id) };
  }
}
