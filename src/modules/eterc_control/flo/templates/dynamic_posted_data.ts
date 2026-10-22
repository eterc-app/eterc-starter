/**
 * Dynamic posted-data template.
 */
import type { TemplateContext } from "../FloTypes";
import { js } from "./helpers";

/** Build the object literal body of get_data_from_post(). */
export function buildPostedData(data: TemplateContext): string {
  const lines: string[] = [];

  for (const property of data.posted_properties) {
    const field = property.form_field_name;

    if (property.property_type === "textarea") {
      lines.push(`      ${field}: String(post(${js(field)}) ?? "").trim(),`);
    } else if (property.property_type === "boolean") {
      lines.push(
        `      ${field}: (post(${js(
          field
        )}) === "1" || post(${js(field)}) === "on" || post(${js(
          field
        )}) === "true" || post(${js(field)}) === true) ? 1 : 0,`
      );
    } else {
      lines.push(`      ${field}: post(${js(field)}, true),`);
    }
  }

  return lines.join("\n");
}
