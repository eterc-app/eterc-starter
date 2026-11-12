import { EtHttpError } from "@/engine/signals";
import type { CmsPrincipal } from "@/modules/cms/cms-types";
import {
  create_record,
  delete_record,
  get_collection,
  get_record,
  update_record,
} from "@/modules/cms/cms-store";
import { principal_from_cms, SYSTEM_PRINCIPAL } from "./flow-principal";
import { run_flow } from "./flow-runner";
import { list_active_flows } from "./flow-store";
import { enqueue_flow_trigger, drain_flow_queue } from "./flow-queue";
import type {
  EventTriggerOptions,
  FlowRecord,
  FlowTriggerPayload,
} from "./flow-types";

export type FlowEventAction = "create" | "update" | "delete";

function event_flows(
  action: FlowEventAction,
  collection: string,
  kind: "filter" | "action"
): FlowRecord[] {
  return list_active_flows("event").filter((flow) => {
    const options = flow.options as unknown as EventTriggerOptions;
    if ((options.type ?? "filter") !== kind) return false;
    const collections = Array.isArray(options.collections) ? options.collections : [];
    if (collections.length > 0 && !collections.includes(collection)) return false;
    const actions = Array.isArray(options.actions)
      ? options.actions
      : ["create", "update", "delete"];
    return actions.includes(action);
  });
}

function event_payload(
  action: FlowEventAction,
  collection: string,
  key: string | number | null,
  payload: unknown,
  previous: unknown
): FlowTriggerPayload {
  return {
    type: "event",
    event: `items.${action}`,
    collection,
    key,
    payload,
    previous,
  };
}

/**
 * Run blocking event filters before a write. A rejected or failing filter
 * blocks the write: fail closed is the only safe default for a filter hook.
 */
export async function dispatch_event_filters(input: {
  action: FlowEventAction;
  collection: string;
  key: string | number | null;
  payload: unknown;
  previous: unknown;
  principal: CmsPrincipal;
}): Promise<void> {
  const flows = event_flows(input.action, input.collection, "filter");
  if (flows.length === 0) return;
  const principal = principal_from_cms(input.principal);
  const payload = event_payload(
    input.action,
    input.collection,
    input.key,
    input.payload,
    input.previous
  );
  for (const flow of flows) {
    const result = await run_flow({
      flow,
      trigger: payload,
      principal,
      timeout_ms: 5_000,
    });
    if (result.status === "rejected") {
      throw new EtHttpError(
        403,
        `The flow '${flow.name}' blocked this ${input.action}.`
      );
    }
    if (result.status !== "success") {
      throw new EtHttpError(
        500,
        `The filter flow '${flow.name}' failed: ${
          result.error?.message ?? result.status
        }`
      );
    }
  }
}

/**
 * Queue non-blocking action hooks after a successful write. The HTTP request
 * returns as soon as the durable job row is inserted.
 */
export function dispatch_event_actions(input: {
  action: FlowEventAction;
  collection: string;
  key: string | number | null;
  payload: unknown;
  previous: unknown;
}): void {
  const flows = event_flows(input.action, input.collection, "action");
  if (flows.length === 0) return;
  const payload = event_payload(
    input.action,
    input.collection,
    input.key,
    input.payload,
    input.previous
  );
  for (const flow of flows) {
    enqueue_flow_trigger(flow.id, "event", payload);
  }
  void drain_flow_queue(5).catch((error) => {
    console.error("[eterc] action hook drain failed", error);
  });
}

function key_of(collection: string, row: Record<string, unknown>): string | number {
  const primaryKey = get_collection(collection).primary_key;
  const value = row[primaryKey];
  return typeof value === "number" ? value : String(value ?? "");
}

export async function create_record_with_flows(
  collection: string,
  values: Record<string, unknown>,
  actorUserId: number | null,
  principal: CmsPrincipal,
  options: { allowSortOverride?: boolean } = {}
): Promise<Record<string, unknown>> {
  await dispatch_event_filters({
    action: "create",
    collection,
    key: null,
    payload: values,
    previous: null,
    principal,
  });
  const row = create_record(collection, values, actorUserId, options);
  dispatch_event_actions({
    action: "create",
    collection,
    key: key_of(collection, row),
    payload: row,
    previous: null,
  });
  return row;
}

export async function update_record_with_flows(
  collection: string,
  id: string | number,
  values: Record<string, unknown>,
  actorUserId: number | null,
  principal: CmsPrincipal
): Promise<Record<string, unknown>> {
  const previous = get_record(collection, id);
  const merged = { ...previous, ...values };
  await dispatch_event_filters({
    action: "update",
    collection,
    key: id,
    payload: merged,
    previous,
    principal,
  });
  const row = update_record(collection, id, values, actorUserId);
  dispatch_event_actions({
    action: "update",
    collection,
    key: id,
    payload: row,
    previous,
  });
  return row;
}

export async function delete_record_with_flows(
  collection: string,
  id: string | number,
  principal: CmsPrincipal
): Promise<void> {
  const previous = get_record(collection, id);
  await dispatch_event_filters({
    action: "delete",
    collection,
    key: id,
    payload: null,
    previous,
    principal,
  });
  delete_record(collection, id);
  dispatch_event_actions({
    action: "delete",
    collection,
    key: id,
    payload: null,
    previous,
  });
}

/** Used by the scheduler/queue when no human principal is available. */
export const flow_system_principal = SYSTEM_PRINCIPAL;
