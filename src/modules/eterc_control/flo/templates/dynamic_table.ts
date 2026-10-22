/**
 * Dynamic summary table template.
 */
import type { TemplateContext } from "../FloTypes";
import { js, jsxText, ucwords } from "./helpers";

/** Build the full <table> markup for the generated manage view. */
export function buildTable(data: TemplateContext): string {
  const properties = data.table_properties;
  const lines: string[] = [];

  lines.push('            <table className="w-full border-collapse text-sm">');
  lines.push('              <thead className="bg-muted/60">');
  lines.push("                <tr>");
  lines.push(`                  <th colSpan={${properties.length + 1}} className="p-3 text-left">`);
  lines.push('                    <div className="flex flex-wrap items-center justify-between gap-2">');
  lines.push('                      <span className="font-semibold">Records</span>');
  lines.push('                      <div className="flex items-center gap-2 text-sm font-normal">');
  lines.push('                        Records Per Page:{" "}');
  lines.push("                        <PerPageSelect");
  lines.push("                          options={per_page_options}");
  lines.push("                          selected={selected_per_page}");
  lines.push(`                          module=${js(data.module_folder_name)}`);
  lines.push("                        />");
  lines.push("                      </div>");
  lines.push("                    </div>");
  lines.push("                  </th>");
  lines.push("                </tr>");
  lines.push("                <tr className=\"border-t\">");
  for (const property of properties) {
    lines.push(
      `                  <th className="p-3 text-left font-semibold">${jsxText(
        ucwords(property.property_name.replace(/_/g, " "))
      )}</th>`
    );
  }
  lines.push('                  <th className="p-3 text-right font-semibold">Actions</th>');
  lines.push("                </tr>");
  lines.push("              </thead>");
  lines.push("              <tbody>");
  lines.push("                {rows.map((row) => (");
  lines.push('                  <tr key={String(row.id)} className="border-t transition-colors hover:bg-muted/40">');

  properties.forEach((property, index) => {
    const field = property.form_field_name;
    if (index === 0) {
      lines.push(
        `                    <td className="p-3"><a className="font-medium text-primary hover:underline" href={site_url(${js(
          `${data.module_folder_name}/show/`
        )} + String(row.id))}>{String(row.${field} ?? "")}</a></td>`
      );
    } else {
      lines.push(`                    <td className="p-3">{String(row.${field} ?? "")}</td>`);
    }
  });

  lines.push('                    <td className="p-3">');
  lines.push('                      <div className="flex items-center justify-end gap-1">');
  lines.push(
    `                        <Button asChild variant="ghost" size="icon">
                          <a href={site_url(${js(
                            `${data.module_folder_name}/show/`
                          )} + String(row.id))} aria-label="View record">
                            <Eye className="size-4" />
                          </a>
                        </Button>`
  );
  lines.push(
    `                        <Button asChild variant="ghost" size="icon">
                          <a href={site_url(${js(
                            `${data.module_folder_name}/create/`
                          )} + String(row.id))} aria-label="Edit record">
                            <Pencil className="size-4" />
                          </a>
                        </Button>`
  );
  lines.push(
    `                        <Button asChild variant="ghost" size="icon">
                          <a href={site_url(${js(
                            `${data.module_folder_name}/delete_conf/`
                          )} + String(row.id))} aria-label="Delete record">
                            <Trash2 className="size-4 text-destructive" />
                          </a>
                        </Button>`
  );
  lines.push("                      </div>");
  lines.push("                    </td>");
  lines.push("                  </tr>");
  lines.push("                ))}");
  lines.push("              </tbody>");
  lines.push("            </table>");

  return lines.join("\n");
}
