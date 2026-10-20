/**
 * Dynamic summary table — port of site_builder/views/dynamic_table.php.
 */

import type { TemplateContext } from "../FloTypes";
import { js, jsxText } from "./helpers";

/** Build the full <table> markup for the generated manage view. */
export function buildTable(data: TemplateContext): string {
  const properties = data.table_properties;
  const lines: string[] = [];

  lines.push('            <table className="records-table">');
  lines.push("              <thead>");
  lines.push("                <tr>");
  lines.push(`                  <th colSpan={${properties.length + 1}}>`);
  lines.push("                    <div>");
  lines.push("                      <div>&nbsp;</div>");
  lines.push("                      <div>");
  lines.push("                        Records Per Page:{\" \"}");
  lines.push("                        <PerPageSelect");
  lines.push("                          options={per_page_options}");
  lines.push("                          selected={selected_per_page}");
  lines.push(`                          module=${js(data.module_folder_name)}`);
  lines.push("                        />");
  lines.push("                      </div>");
  lines.push("                    </div>");
  lines.push("                  </th>");
  lines.push("                </tr>");
  lines.push("                <tr>");
  for (const property of properties) {
    lines.push(
      `                  <th className="text-left">${jsxText(
        property.property_name
      )}</th>`
    );
  }
  lines.push("                  <th>Actions</th>");
  lines.push("                </tr>");
  lines.push("              </thead>");
  lines.push("              <tbody>");
  lines.push("                {rows.map((row) => (");
  lines.push("                  <tr key={String(row.id)}>");

  properties.forEach((property, index) => {
    const field = property.form_field_name;
    if (index === 0) {
      lines.push(
        `                    <td><a href={siteUrl(${js(
          `${data.module_folder_name}/show/`
        )} + String(row.id))}>{String(row.${field} ?? "")}</a></td>`
      );
    } else {
      lines.push(`                    <td>{String(row.${field} ?? "")}</td>`);
    }
  });

  lines.push("                    <td>");
  lines.push('                      <div className="actions">');
  lines.push(
    `                        <a href={siteUrl(${js(
      `${data.module_folder_name}/show/`
    )} + String(row.id))} className="button alt button-round"><i className="tg tg-eye"></i></a>`
  );
  lines.push(
    `                        <a href={siteUrl(${js(
      `${data.module_folder_name}/create/`
    )} + String(row.id))} className="button alt button-round"><i className="tg tg-pencil"></i></a>`
  );
  lines.push(
    `                        <a href={siteUrl(${js(
      `${data.module_folder_name}/delete_conf/`
    )} + String(row.id))} className="button alt button-round"><i className="tg tg-trash"></i></a>`
  );
  lines.push("                      </div>");
  lines.push("                    </td>");
  lines.push("                  </tr>");
  lines.push("                ))}");
  lines.push("              </tbody>");
  lines.push("            </table>");

  return lines.join("\n");
}
