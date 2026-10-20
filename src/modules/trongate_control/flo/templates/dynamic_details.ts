/**
 * Dynamic detail grid — port of site_builder/views/dynamic_details.php.
 */

import type { TemplateContext } from "../FloTypes";
import { jsxText, ucwords } from "./helpers";

/** Build the detail grid markup for the generated show view. */
export function buildDetails(data: TemplateContext): string {
  const lines: string[] = [];
  lines.push('          <div className="space-y-4">');

  for (const property of data.posted_properties) {
    const field = property.form_field_name;
    if (property.property_type === "textarea") {
      lines.push(
        '            <div className="space-y-1 border-b pb-4 last:border-0 last:pb-0">'
      );
      lines.push(
        `              <div className="text-sm font-medium text-muted-foreground">${jsxText(
          ucwords(property.property_name.replace(/_/g, " "))
        )}</div>`
      );
      lines.push(
        `              <div className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{String(data.${field} ?? "")}</div>`
      );
      lines.push("            </div>");
    } else {
      lines.push(
        '            <div className="grid gap-1 border-b pb-4 last:border-0 last:pb-0 sm:grid-cols-[12rem_1fr]">'
      );
      lines.push(
        `              <div className="text-sm font-medium text-muted-foreground">${jsxText(
          ucwords(property.property_name.replace(/_/g, " "))
        )}</div>`
      );
      lines.push(
        `              <div className="text-sm">{String(data.${field} ?? "")}</div>`
      );
      lines.push("            </div>");
    }
  }

  lines.push("          </div>");
  return lines.join("\n");
}
