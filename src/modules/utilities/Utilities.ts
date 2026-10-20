import { createElement, type ReactNode } from "react";
import { Trongate } from "@/engine/controller";
import { get_context, segment } from "@/engine/request-context";
import { get_view } from "@/engine/views-registry";
import { TgHttpError } from "@/engine/signals";

/**
 * Utilities module — port of modules/utilities/Utilities.php.
 *
 * Framework service with the same public method names as the PHP original.
 * Where the PHP code echoed output or called die(), the port returns nodes /
 * throws framework signals (documented per method).
 */

/**
 * Port of the utilities block_url() helper.
 *
 * Throws 403 Forbidden when the current URL addresses the blocked module
 * (or module/method) — the port's replacement for
 * `http_response_code(403); die(...)`. Internal calls are unaffected because
 * the current route simply is not the blocked one.
 */
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
      throw new TgHttpError(403, "403 Forbidden - Direct URL access not permitted");
    }
    return;
  }

  const current_method = String(segment(2) ?? "").toLowerCase();
  if (
    current_module === target_module.toLowerCase() &&
    current_method === target_method.toLowerCase()
  ) {
    throw new TgHttpError(403, "403 Forbidden - Direct URL access not permitted");
  }
}

export default class Utilities extends Trongate {
  /**
   * Blocks direct browser access to a module or a module/method combination.
   * See block_url() above — internal PHP calls were harmless, internal TS
   * calls are equally unaffected.
   */
  block_url(block_path = ""): void {
    block_url(block_path);
  }

  /**
   * Outputs the given data as prettified JSON inside a <pre> element.
   *
   * @param data Array containing 'data' and 'kill_script' keys.
   * @returns The rendered node. PHP's `kill_script` terminated the response;
   *          in React the caller simply returns this node.
   */
  json(data: { data?: unknown; kill_script?: unknown }): ReactNode {
    let encoded = "";
    try {
      encoded = JSON.stringify(data?.data ?? null, null, 4) ?? "";
    } catch {
      encoded = "";
    }
    return createElement("pre", null, encoded);
  }

  /**
   * Get the client's IP address.
   *
   * PHP read $_SERVER['REMOTE_ADDR']; the port reads the forwarding headers
   * provided by its runtime (x-forwarded-for first, then x-real-ip).
   */
  ip_address(): string {
    const ctx = get_context();
    const forwarded = ctx.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return ctx.headers.get("x-real-ip") ?? "";
  }

  /**
   * Display a content view.
   *
   * PHP auto-detected view_module (segment 1, defaulting to 'welcome'),
   * defaulted view_file to 'index' and echoed a red error block when the view
   * file was missing; the port renders the same error block as a node.
   */
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

  /**
   * Extract file name and extension from a given file path.
   *
   * Mirrors return_file_info() exactly: pathinfo() extension, then
   * str_replace(".ext", "", $file_string) on the full path.
   */
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

    // PHP pathinfo() returns '' for names without an extension and, for
    // dot-files such as ".htaccess", an extension of "htaccess".
    const file_extension = last_dot === -1 ? "" : base.slice(last_dot + 1);
    const file_name = file_string.split("." + file_extension).join("");

    return { file_name, file_extension: "." + file_extension };
  }

  /**
   * Sorts an array of associative arrays by a specified property.
   *
   * @param data Array containing 'array', 'property' and 'direction' keys.
   * @returns A new sorted array (PHP's usort() sorted in place).
   */
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

  /**
   * Sorts an array of objects by a specified property. Kept as a separate
   * public method for parity with the PHP original (identical semantics).
   */
  sort_rows_by_property(data: {
    array?: Array<Record<string, unknown>>;
    property?: string;
    direction?: string;
  }): Array<Record<string, unknown>> {
    return this.sort_by_property(data);
  }

  /**
   * True when the request carries the Trongate-MX-Request header (the PHP
   * original only checked that the header was set, whatever its value).
   */
  from_trongate_mx(): boolean {
    return get_context().headers.get("trongate-mx-request") !== null;
  }
}

/** PHP's strcasecmp()/spaceship comparison for one property. */
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
