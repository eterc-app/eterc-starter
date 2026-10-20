"use client";

import { useState, type FormEvent } from "react";
import { useTgUi } from "@/engine/ui/TgUiProvider";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * Editable module details — port of
 * module_builder/views/conf_module_details.php.
 *
 * The PHP view seeded form values from localStorage through flo.js and posted
 * with `mx-post`; the React port receives the wizard values as props, posts
 * the form to the JSON API and reproduces the `afterValidation` behaviour:
 *   - success: postMessage('reload_iframe:<url>|<width>|<height>')
 *   - failure: render the validation errors in the form.
 */

interface DetailsWizard {
  module_folder_name?: string;
  record_name_singular?: string;
  record_name_plural?: string;
  nav_label?: string;
  properties?: unknown;
  url_column?: string;
  order_by?: string;
}

type Errors = Record<string, string[]>;

const PAGE_CSS = `
.form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

.form-column {
    display: flex;
    flex-direction: column;
}

.form-column label {
    margin-bottom: 5px;
}

.form-column input,
.form-column select,
.form-column textarea {
    width: 100%;
}

.form-buttons {
    margin-top: 2em;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
}

.form-buttons button {
    margin-left: 1em;
}
`;

export default function ConfModuleDetails({ data }: TgViewProps) {
  const { csrfToken } = useTgUi();

  const wizard = (data.wizard ?? {}) as DetailsWizard;
  const urlColumnOptions = (data.url_column_options ?? {
    "": "-- No URL Column --",
  }) as Record<string, string>;
  const orderByOptions = (data.order_by_options ?? {
    id: "id",
    "id DESC": "id DESC",
  }) as Record<string, string>;

  const afterCloseUrl = String(
    data.after_close_url ??
      "/trongate_control-module_builder/conf_generate_mod?template=c64"
  );
  const afterCloseWidth = String(data.after_close_width ?? 800);
  const afterCloseHeight = String(data.after_close_height ?? 600);

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");

  const closeWindow = () => {
    window.parent.postMessage(
      `reload_iframe:${afterCloseUrl}|${afterCloseWidth}|${afterCloseHeight}`,
      "*"
    );
    // When the page is not running inside the Flo iframe shell there is no
    // parent listener; navigate to the same destination instead.
    if (typeof window !== "undefined" && window.parent === window) {
      window.location.href = afterCloseUrl;
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setNotice("");

    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = {
      moduleDir: String(form.get("moduleDir") ?? ""),
      recordNameSingular: String(form.get("recordNameSingular") ?? ""),
      recordNamePlural: String(form.get("recordNamePlural") ?? ""),
      navLabel: String(form.get("navLabel") ?? ""),
      properties: String(form.get("properties") ?? ""),
      urlColumn: String(form.get("urlColumn") ?? ""),
      orderBy: String(form.get("orderBy") ?? ""),
      csrf_token: csrfToken,
    };

    try {
      const response = await fetch(
        "/api/xhr/trongate_control-module_builder/submit_mod_details",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const envelope = (await response.json()) as {
        status?: string;
        data?: { ok?: boolean; errors?: Errors };
        errors?: Errors;
        message?: string;
        redirect?: string;
      };

      if (envelope.status === "redirect") {
        window.location.href = envelope.redirect ?? "/";
        return;
      }

      if (envelope.status === "error") {
        setNotice(envelope.message ?? "The details could not be saved.");
        return;
      }

      const result = envelope.data ?? {};
      if (result.ok === true) {
        closeWindow();
        return;
      }

      const resultErrors = result.errors ?? envelope.errors;
      if (resultErrors && Object.keys(resultErrors).length > 0) {
        setErrors(resultErrors);
      } else {
        setNotice("The details could not be saved.");
      }
    } catch {
      setNotice("A network error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const fieldErrors = (field: string) => {
    const messages = errors[field];
    if (!messages || messages.length === 0) return null;
    return (
      <ul className="validation-errors">
        {messages.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ul>
    );
  };

  return (
    <div className="container">
      <h1>Module Details</h1>

      <form
        action="#"
        className="highlight-errors sm"
        onSubmit={handleSubmit}
      >
        <div className="form-row">
          <div className="form-column">
            <label htmlFor="moduleDir-input">Module Directory</label>
            {fieldErrors("moduleDir")}
            <input
              type="text"
              name="moduleDir"
              id="moduleDir-input"
              autoComplete="off"
              defaultValue={wizard.module_folder_name ?? ""}
            />
          </div>

          <div className="form-column">
            <label htmlFor="recordNameSingular-input">Record Name Singular</label>
            {fieldErrors("recordNameSingular")}
            <input
              type="text"
              name="recordNameSingular"
              id="recordNameSingular-input"
              autoComplete="off"
              defaultValue={wizard.record_name_singular ?? ""}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-column">
            <label htmlFor="recordNamePlural-input">Record Name Plural</label>
            {fieldErrors("recordNamePlural")}
            <input
              type="text"
              name="recordNamePlural"
              id="recordNamePlural-input"
              autoComplete="off"
              defaultValue={wizard.record_name_plural ?? ""}
            />
          </div>

          <div className="form-column">
            <label htmlFor="navLabel-input">Nav Label</label>
            {fieldErrors("navLabel")}
            <input
              type="text"
              name="navLabel"
              id="navLabel-input"
              autoComplete="off"
              defaultValue={wizard.nav_label ?? ""}
            />
          </div>
        </div>

        <label htmlFor="properties-input">Properties</label>
        {fieldErrors("properties")}
        <textarea
          name="properties"
          id="properties-input"
          rows={12}
          defaultValue={JSON.stringify(wizard.properties ?? [])}
        />

        <div className="form-row">
          <div className="form-column">
            <label htmlFor="urlColumn-input">URL Column</label>
            {fieldErrors("urlColumn")}
            <select
              name="urlColumn"
              id="urlColumn-input"
              defaultValue={wizard.url_column ?? ""}
            >
              {Object.entries(urlColumnOptions).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-column">
            <label htmlFor="orderBy-input">Order By</label>
            {fieldErrors("orderBy")}
            <select
              name="orderBy"
              id="orderBy-input"
              defaultValue={wizard.order_by || "id"}
            >
              {Object.entries(orderByOptions).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {notice ? <p style={{ color: "#b00020" }}>{notice}</p> : null}

        <div className="text-center form-buttons">
          <button type="button" className="close-btn alt" onClick={closeWindow}>
            Close Window
          </button>
          <button type="submit" className="submit-btn" disabled={busy}>
            Update Details
          </button>
        </div>
      </form>

      <style>{PAGE_CSS}</style>
    </div>
  );
}
