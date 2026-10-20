/**
 * Dynamic detail grid — port of site_builder/views/dynamic_details.php.
 */

import type { TemplateContext } from "../FloTypes";
import { jsxText } from "./helpers";

/** Build the detail grid markup for the generated show view. */
export function buildDetails(data: TemplateContext): string {
  const lines: string[] = [];
  lines.push('          <div className="detail-grid">');

  for (const property of data.posted_properties) {
    const field = property.form_field_name;
    if (property.property_type === "textarea") {
      lines.push('            <div className="detail-block">');
      lines.push(
        `              <div className="detail-label">${jsxText(
          property.property_name
        )}</div>`
      );
      lines.push(
        `              <div className="detail-content" style={{ whiteSpace: "pre-wrap" }}>{String(data.${field} ?? "")}</div>`
      );
      lines.push("            </div>");
    } else {
      lines.push('            <div className="detail-row">');
      lines.push(
        `              <div className="detail-label">${jsxText(
          property.property_name
        )}</div>`
      );
      lines.push(
        `              <div className="detail-value">{String(data.${field} ?? "")}</div>`
      );
      lines.push("            </div>");
    }
  }

  lines.push("          </div>");
  return lines.join("\n");
}
