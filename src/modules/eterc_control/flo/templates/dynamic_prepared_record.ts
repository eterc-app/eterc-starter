/**
 * Dynamic display preparation — port of
 * site_builder/views/dynamic_prepared_record.php.
 */

import type { TemplateContext } from "../FloTypes";

/** Build the trim/boolean display conversions in prepare_record_for_display(). */
export function buildPreparedRecord(data: TemplateContext): string {
  const lines: string[] = [];

  for (const property of data.posted_properties) {
    const field = property.form_field_name;

    if (
      property.property_type === "varchar" ||
      property.property_type === "textarea"
    ) {
      lines.push(
        `    record.${field} = typeof record.${field} === "string" ? record.${field}.trim() : record.${field};`
      );
    } else if (property.property_type === "boolean") {
      lines.push(
        `    record.${field} = Number(record.${field} ?? 0) === 1 ? "yes" : "no";`
      );
    }
  }

  return lines.join("\n");
}
