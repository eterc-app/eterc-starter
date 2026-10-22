import { createElement, type ReactNode } from "react";
import { Eterc } from "@/engine/controller";
import { get_context, segment } from "@/engine/request-context";
import { get_view } from "@/engine/views-registry";
import { EtHttpError } from "@/engine/signals";
export function block_url(block_path = ""): void {
  if (block_path === "") {
    return; // Nothing to block.
  }

  const bits = block_path.split("/");
  const target_module = bits[0];
  const target_method = bits[1] ?? "";

  const current_module = String(segment(1) ?? "").toLowerCase();

  if (target_method === "") {
    if (current_module === target_module.toLowerCase()) {
      throw new EtHttpError(403, "403 Forbidden - Direct URL access not permitted");
    }
    return;
  }

  const current_method = String(segment(2) ?? "").toLowerCase();
  if (
    current_module === target_module.toLowerCase() &&
    current_method === target_method.toLowerCase()
  ) {
    throw new EtHttpError(403, "403 Forbidden - Direct URL access not permitted");
  }
}

export default class Utilities extends Eterc {
  block_url(block_path = ""): void {
    block_url(block_path);
  }
  json(data: { data?: unknown; kill_script?: unknown }): ReactNode {
    let encoded = "";
    try {
      encoded = JSON.stringify(data?.data ?? null, null, 4) ?? "";
    } catch {
      encoded = "";
    }
    return createElement("pre", null, encoded);
  }
  ip_address(): string {
    const ctx = get_context();
    const forwarded = ctx.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return ctx.headers.get("x-real-ip") ?? "";
  }
  async display(data: Record<string, unknown> = {}): Promise<ReactNode> {
    const view_module =
      data.view_module !== undefined && data.view_module !== ""
        ? String(data.view_module)
        : String(segment(1) ?? "") || "welcome";

    const view_file =
      data.view_file !== undefined && data.view_file !== ""
        ? String(data.view_file)
        : "index";

    const key = `${view_module}/${view_file}`;

    if (get_view(key) === undefined) {
      return createElement(
        "div",
        {
          style: {
            color: "red",
            padding: "1rem",
            border: "2px solid red",
          },
        },
        createElement("h2", null, "View Not Found"),
        createElement(
          "p",
          null,
          "Looking for: ",
          createElement("code", null, `modules/${view_module}/views/${view_file}.tsx`)
        )
      );
    }

    return this.templates.view(key, data);
  }
  return_file_info(file_string: string): {
    file_name: string;
    file_extension: string;
  } {
    const last_slash = Math.max(
      file_string.lastIndexOf("/"),
      file_string.lastIndexOf("\\")
    );
    const base = file_string.slice(last_slash + 1);
    const last_dot = base.lastIndexOf(".");

    const file_extension = last_dot === -1 ? "" : base.slice(last_dot + 1);
    const file_name = file_string.split("." + file_extension).join("");

    return { file_name, file_extension: "." + file_extension };
  }
  sort_by_property(data: {
    array?: Array<Record<string, unknown>>;
    property?: string;
    direction?: string;
  }): Array<Record<string, unknown>> {
    const array = data?.array ?? [];
    const property = data?.property ?? "";
    const direction = data?.direction ?? "asc";

    return [...array].sort((a, b) => {
      const result = compareValues(a?.[property], b?.[property]);
      return direction === "desc" ? -result : result;
    });
  }
  sort_rows_by_property(data: {
    array?: Array<Record<string, unknown>>;
    property?: string;
    direction?: string;
  }): Array<Record<string, unknown>> {
    return this.sort_by_property(data);
  }
  from_eterc_mx(): boolean {
    return get_context().headers.get("eterc-mx-request") !== null;
  }
}
function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") {
    const left = a.toLowerCase();
    const right = b.toLowerCase();
    if (left === right) return 0;
    return left < right ? -1 : 1;
  }

  const left = a as number | bigint;
  const right = b as number | bigint;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
