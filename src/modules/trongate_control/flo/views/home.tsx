"use client";

import { useState, type FormEvent } from "react";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * Flo home / quick generator — port of flo/views/flo.php.
 *
 * The PHP home page was a menu inside the Flo iframe. The port keeps that
 * role and adds a compact generator form so Flo can produce a complete
 * Next.js module directly. Submissions go to the JSON API, never to a
 * page-navigation POST.
 */

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

const PAGE_CSS = `
.flo-page h1 { margin-top: 0; }
.flo-intro { max-width: 760px; }
.flo-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
}
.flo-grid .full { grid-column: 1 / -1; }
.flo-page label { display: block; font-weight: bold; margin-bottom: 4px; }
.flo-page input[type="text"],
.flo-page input[type="number"],
.flo-page textarea,
.flo-page select {
    width: 100%;
    box-sizing: border-box;
}
.flo-page textarea { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.flo-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: center;
    margin-top: 20px;
}
.flo-result { margin-top: 20px; padding: 14px 18px; border-radius: 8px; }
.flo-result.success { background: #e7f7ec; border: 1px solid #8fd2a4; }
.flo-result.error { background: #fdecea; border: 1px solid #e39a92; }
.flo-result h2 { margin-top: 0; }
.flo-modules { margin-top: 28px; }
.flo-module-list { list-style: none; padding-left: 0; }
.flo-module-list li {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 8px;
    background: #fff;
}
.flo-module-list code { margin-right: 8px; }
@media (max-width: 700px) {
    .flo-grid { grid-template-columns: 1fr; }
}
`;

export default function FloHome({ data }: TgViewProps) {
  const apiBase = String(data.api_base ?? "/api/xhr/trongate_control-flo");
  const moduleBuilderUrl = String(
    data.module_builder_url ?? "/trongate_control-module_builder"
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
    <div className="flo-page">
      <h1>Flo — Code Generator</h1>

      <p className="flo-intro">
        Flo builds a complete Next.js CRUD module: a controller extending the
        port&apos;s <code>Trongate</code> base class, a model, TSX views and a
        generated view map. Artifacts are written to{" "}
        <code>src/modules/generated/&lt;module&gt;/</code>. Prefer the{" "}
        <a href={moduleBuilderUrl}>Module Builder</a> when you want the guided
        wizard; this form is the fast path.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="flo-grid">
          <div>
            <label htmlFor="flo-module-name">Module folder name</label>
            <input
              id="flo-module-name"
              type="text"
              name="module_folder_name"
              placeholder="tasks"
              required
              pattern="[a-z][a-z0-9_]*"
              title="Lowercase letters, numbers and underscores; must start with a letter."
            />
          </div>

          <div>
            <label htmlFor="flo-nav-label">Navigation label</label>
            <input
              id="flo-nav-label"
              type="text"
              name="nav_label"
              placeholder="Tasks"
            />
          </div>

          <div>
            <label htmlFor="flo-singular">Record name (singular)</label>
            <input
              id="flo-singular"
              type="text"
              name="record_name_singular"
              placeholder="Task"
            />
          </div>

          <div>
            <label htmlFor="flo-plural">Record name (plural)</label>
            <input
              id="flo-plural"
              type="text"
              name="record_name_plural"
              placeholder="Tasks"
            />
          </div>

          <div>
            <label htmlFor="flo-url-column">URL column</label>
            <input
              id="flo-url-column"
              type="text"
              name="urlColumn"
              placeholder="Optional"
            />
          </div>

          <div>
            <label htmlFor="flo-order-by">Default order by</label>
            <input
              id="flo-order-by"
              type="text"
              name="orderBy"
              defaultValue="id"
              placeholder="id or column DESC"
            />
          </div>

          <div className="full">
            <label htmlFor="flo-properties">Properties (JSON array)</label>
            <textarea
              id="flo-properties"
              name="properties"
              rows={14}
              defaultValue={JSON.stringify(propertiesExample, null, 2)}
            />
          </div>

          <div className="full">
            <label>
              <input type="checkbox" name="run_sql" defaultChecked /> Create the
              SQLite table after writing the files
            </label>
          </div>
        </div>

        <div className="flo-actions">
          <button type="submit" disabled={busy}>
            {busy ? "Generating..." : "Generate Module"}
          </button>
          {busy ? <span>Writing controller, model and views…</span> : null}
        </div>
      </form>

      {error ? (
        <div className="flo-result error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {result ? (
        <div
          className={
            result.status === "success" ? "flo-result success" : "flo-result error"
          }
          role="status"
        >
          {result.headline ? <h2>{result.headline}</h2> : null}
          <p>{result.message}</p>
          {result.files && result.files.length > 0 ? (
            <p>
              {result.files.length} file{result.files.length === 1 ? "" : "s"}{" "}
              written.
            </p>
          ) : null}
          {result.more_info_url ? (
            <p>
              <a href={result.more_info_url}>Learn more about this error</a>
            </p>
          ) : null}
          {moduleUrl ? (
            <p>
              <a className="button alt" href={moduleUrl}>
                View your module
              </a>
            </p>
          ) : null}
          {result.status === "success" ? (
            <p>
              If the new controller or views are not available yet, restart the
              dev server so Next.js can bundle the generated index.
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="flo-modules">
        <h2>Generated modules</h2>
        {generatedModules.length === 0 ? (
          <p>No modules have been generated yet.</p>
        ) : (
          <ul className="flo-module-list">
            {generatedModules.map((module) => (
              <li key={module.module_name}>
                <code>{module.module_name}</code>
                <strong>{module.label}</strong>
                {module.has_searchable ? " · searchable" : ""}
                {module.href ? (
                  <>
                    {" · "}
                    <a href={module.href}>Manage</a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <style>{PAGE_CSS}</style>
    </div>
  );
}

export { FloHome };
