import fs from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import "@scalar/api-reference-react/style.css";
import { build_openapi_document } from "@/engine/api";
import { list_collections } from "@/modules/cms/cms-store";
import { get_access_overview } from "@/modules/cms/cms-access";
import { ApiWorkbench } from "./ApiWorkbench";

export const metadata: Metadata = {
  title: "API Explorer | Eterc",
  description: "Browse, test, and audit the REST API, access policies, and collections.",
};

async function ApiReferenceContent() {
  await connection();
  const openapi = build_openapi_document();
  const appDir = path.join(process.cwd(), "src", "app");

  const rawCollections = list_collections({ include_hidden: true });
  const collections = rawCollections.map((col) => {
    const hasUiRoute = fs.existsSync(path.join(appDir, col.name, "page.tsx"));
    return {
      id: col.id,
      name: col.name,
      label: col.label || col.name,
      icon: col.icon || "database",
      primary_key: col.primary_key,
      singleton: Boolean(col.singleton),
      hidden: Boolean(col.hidden),
      system: Boolean(col.system),
      item_count: col.item_count,
      hasUiRoute,
      uiRoutePath: hasUiRoute ? `/${col.name}` : null,
      adminDataPath: `/admin/data?collection=${encodeURIComponent(col.name)}`,
      fields: col.fields.map((f) => ({
        name: f.name,
        label: f.label || f.name,
        type: f.type,
        interface: f.interface,
        required: Boolean(f.required),
        unique: Boolean(f.unique),
        hidden: Boolean(f.hidden),
        readonly: Boolean(f.readonly),
      })),
    };
  });

  const access = get_access_overview();

  return (
    <ApiWorkbench
      collections={collections}
      roles={access.roles}
      permissions={access.permissions}
      apiKeys={access.api_keys}
      openapiDocument={openapi}
    />
  );
}

export default function ApiReferencePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
          Loading API Explorer…
        </div>
      }
    >
      <ApiReferenceContent />
    </Suspense>
  );
}
