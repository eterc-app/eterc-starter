import type { ReactNode } from "react";
import { render_view } from "./views-registry";
import { PublicTemplate } from "@/templates/PublicTemplate";
import { AdminTemplate } from "@/templates/AdminTemplate";
import { Error404 } from "@/templates/Error404";
import { resolve_principal } from "@/modules/cms/cms-access";
import { get_cms_project_settings } from "@/modules/cms/cms-project";
import type { CmsPrincipal } from "@/modules/cms/cms-types";

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
    const project = get_cms_project_settings();
    let principal = data.principal as CmsPrincipal | undefined;
    if (!principal) {
      try {
        principal = await resolve_principal({ requireApiAccess: false });
      } catch {
        principal = undefined;
      }
    }
    const accountName =
      principal?.user_username || principal?.user_email || "Administrator";
    const accountEmail = principal?.user_email || principal?.label || "Eterc account";

    return (
      <AdminTemplate
        pageTitle={data.pageTitle ? String(data.pageTitle) : "Admin Panel"}
        theme={data.theme ? String(data.theme) : "default"}
        projectName={project.name}
        projectDescriptor={project.descriptor}
        accountName={accountName}
        accountEmail={accountEmail}
      >
        {viewNode(data)}
      </AdminTemplate>
    );
  }

  /** 404 page. */
  async error_404(): Promise<ReactNode> {
    return <Error404 />;
  }
}
