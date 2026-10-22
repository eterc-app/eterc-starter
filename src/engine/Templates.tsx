import type { ReactNode } from "react";
import { render_view } from "./views-registry";
import { PublicTemplate } from "@/templates/PublicTemplate";
import { AdminTemplate } from "@/templates/AdminTemplate";
import { ModuleDetailsTemplate } from "@/templates/ModuleDetailsTemplate";
import { Error404 } from "@/templates/Error404";

/**
 * Templates service — port of modules/templates/Templates.php.
 * The PHP `display()` call (rendering a view inside a theme) becomes a React
 * composition of the theme component with the addressed view component.
 */

export interface EtTemplateData extends Record<string, unknown> {
  viewModule?: string;
  viewFile?: string;
  pageTitle?: string;
  theme?: string;
  additional_includes_top?: string | string[];
  additional_includes_btm?: string | string[];
}

function viewNode(data: EtTemplateData): ReactNode {
  const moduleName = String(data.viewModule ?? "");
  const file = String(data.viewFile ?? "");
  return render_view(`${moduleName}/${file}`, data);
}

export class Templates {
  /** Render a single view (parity with controller view()/display()). */
  async view(name: string, data: Record<string, unknown> = {}): Promise<ReactNode> {
    return render_view(name, data);
  }

  /** Public theme. */
  async public(data: EtTemplateData): Promise<ReactNode> {
    return (
      <PublicTemplate pageTitle={data.pageTitle ? String(data.pageTitle) : undefined}>
        {viewNode(data)}
      </PublicTemplate>
    );
  }

  /** Admin theme. */
  async admin(data: EtTemplateData): Promise<ReactNode> {
    return (
      <AdminTemplate
        pageTitle={data.pageTitle ? String(data.pageTitle) : "Admin Panel"}
        theme={data.theme ? String(data.theme) : "default"}
      >
        {viewNode(data)}
      </AdminTemplate>
    );
  }

  /** Full-page module details template (Flo overlay iframe). */
  async module_details(data: EtTemplateData): Promise<ReactNode> {
    return (
      <ModuleDetailsTemplate
        afterCloseUrl={String(data.after_close_url ?? "")}
        afterCloseWidth={String(data.after_close_width ?? "")}
        afterCloseHeight={String(data.after_close_height ?? "")}
      >
        {viewNode(data)}
      </ModuleDetailsTemplate>
    );
  }

  /** 404 page. */
  async error_404(): Promise<ReactNode> {
    return <Error404 />;
  }
}
