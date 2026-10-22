"use client";

import { useState, type FormEvent } from "react";
import type { EtViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface GeneratedModuleRow {
  module_name?: string;
  class_name?: string;
  label?: string;
  href?: string;
  has_searchable?: boolean;
  generated_at?: string;
}

interface GenerationOutcome {
  status?: string;
  ok?: boolean;
  headline?: string;
  message?: string;
  more_info_url?: string;
  module_name?: string;
  module_url?: string;
  files?: string[];
}

export default function FloHome({ data }: EtViewProps) {
  const apiBase = String(data.api_base ?? "/api/xhr/eterc_control-flo");
  const moduleBuilderUrl = String(
    data.module_builder_url ?? "/control/module-builder"
  );
  const propertiesExample = data.properties_example ?? [
    {
      propertyName: "Task Title",
      propertyType: "varchar",
      onForm: "yes",
      isSearchable: "yes",
      onSummaryTable: "yes",
      validationRules: ["required", "max length[120]"],
    },
  ];
  const generatedModules = (
    Array.isArray(data.generated_modules) ? data.generated_modules : []
  ) as GeneratedModuleRow[];

  const initialResult = (data.generation_result ??
    null) as GenerationOutcome | null;
  const [result, setResult] = useState<GenerationOutcome | null>(initialResult);
  const [moduleUrl, setModuleUrl] = useState(String(data.module_url ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    setModuleUrl("");

    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      module_folder_name: String(form.get("module_folder_name") ?? ""),
      record_name_singular: String(form.get("record_name_singular") ?? ""),
      record_name_plural: String(form.get("record_name_plural") ?? ""),
      nav_label: String(form.get("nav_label") ?? ""),
      properties: String(form.get("properties") ?? ""),
      urlColumn: String(form.get("urlColumn") ?? ""),
      orderBy: String(form.get("orderBy") ?? ""),
      run_sql: form.get("run_sql") === "on",
    };

    try {
      const response = await fetch(`${apiBase}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const envelope = (await response.json()) as {
        status?: string;
        data?: GenerationOutcome;
        message?: string;
        redirect?: string;
      };

      if (envelope.status === "redirect") {
        window.location.href = envelope.redirect ?? "/";
        return;
      }

      if (envelope.status === "error") {
        setError(envelope.message ?? "The module could not be generated.");
        return;
      }

      const outcome = envelope.data ?? null;
      setResult(outcome);
      if (outcome?.module_url) setModuleUrl(outcome.module_url);
      if (outcome?.status === "success") {
        // Refresh the list without leaving the page.
        window.setTimeout(() => window.location.reload(), 1200);
      }
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Flo builds a complete Next.js CRUD module: a controller extending the
        Eterc&apos;s base controller class, a model, TSX views and a generated view map.
        Artifacts are written
        to <code className="rounded bg-muted px-1 py-0.5 text-xs">src/modules/generated/&lt;module&gt;/</code>.
        Prefer the <a className="font-medium text-primary underline-offset-4 hover:underline" href={moduleBuilderUrl}>Module Builder</a>{" "}
        when you want the guided wizard; this form is the fast path.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Module details</CardTitle>
          <CardDescription>
            Describe the module and the properties that should appear in its
            forms and summary table.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="flo-module-name">Module folder name</Label>
                <Input
                  id="flo-module-name"
                  type="text"
                  name="module_folder_name"
                  placeholder="tasks"
                  required
                  pattern="[a-z][a-z0-9_]*"
                  title="Lowercase letters, numbers and underscores; must start with a letter."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="flo-nav-label">Navigation label</Label>
                <Input
                  id="flo-nav-label"
                  type="text"
                  name="nav_label"
                  placeholder="Tasks"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="flo-singular">Record name (singular)</Label>
                <Input
                  id="flo-singular"
                  type="text"
                  name="record_name_singular"
                  placeholder="Task"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="flo-plural">Record name (plural)</Label>
                <Input
                  id="flo-plural"
                  type="text"
                  name="record_name_plural"
                  placeholder="Tasks"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="flo-url-column">URL column</Label>
                <Input
                  id="flo-url-column"
                  type="text"
                  name="urlColumn"
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="flo-order-by">Default order by</Label>
                <Input
                  id="flo-order-by"
                  type="text"
                  name="orderBy"
                  defaultValue="id"
                  placeholder="id or column DESC"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="flo-properties">Properties (JSON array)</Label>
              <Textarea
                id="flo-properties"
                name="properties"
                rows={14}
                className="font-mono text-xs leading-relaxed"
                defaultValue={JSON.stringify(propertiesExample, null, 2)}
              />
            </div>

            <Label className="flex items-start gap-2 font-normal">
              <input
                type="checkbox"
                name="run_sql"
                defaultChecked
                className="m-0 mt-0.5 size-4 rounded border-input"
              />
              Create the SQLite table after writing the files
            </Label>

            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <Button type="submit" disabled={busy}>
                {busy ? "Generating..." : "Generate Module"}
              </Button>
              {busy ? (
                <span className="text-sm text-muted-foreground">
                  Writing controller, model and views...
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {result ? (
        <div
          className={
            result.status === "success"
              ? "space-y-2 rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
              : "space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          }
          role="status"
        >
          {result.headline ? <h2 className="text-base font-semibold">{result.headline}</h2> : null}
          <p>{result.message}</p>
          {result.files && result.files.length > 0 ? (
            <p>
              {result.files.length} file{result.files.length === 1 ? "" : "s"}{" "}
              written.
            </p>
          ) : null}
          {result.more_info_url ? (
            <p>
              <a className="font-medium underline underline-offset-4" href={result.more_info_url}>
                Learn more about this error
              </a>
            </p>
          ) : null}
          {moduleUrl ? (
            <Button asChild variant="outline" size="sm">
              <a href={moduleUrl}>View your module</a>
            </Button>
          ) : null}
          {result.status === "success" ? (
            <p>
              If the new controller or views are not available yet, restart the
              dev server so Next.js can bundle the generated index.
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Generated modules</h2>
          <p className="text-sm text-muted-foreground">
            Modules written by Flo into the local generated-module registry.
          </p>
        </div>
        {generatedModules.length === 0 ? (
          <p className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground">
            No modules have been generated yet.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {generatedModules.map((module) => (
              <li
                key={module.module_name}
                className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"
              >
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {module.module_name}
                </code>
                <span className="font-medium">{module.label}</span>
                {module.has_searchable ? (
                  <span className="text-muted-foreground">Searchable</span>
                ) : null}
                {module.href ? (
                  <Button asChild variant="outline" size="sm" className="ml-auto">
                    <a href={module.href}>Manage</a>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export { FloHome };
