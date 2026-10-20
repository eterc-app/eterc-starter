"use client";

import { useState, type FormEvent } from "react";
import { useTgUi } from "@/engine/ui/TgUiProvider";
import type { TgViewProps } from "@/engine/views-registry";
import type { RelationsWizard } from "../types";

/**
 * Editable relation details — port of
 * module_relations_builder/views/conf_relation_details.php.
 *
 * The PHP view displayed a read-only summary, seeded identifier inputs from
 * localStorage through flo.js and posted with mx-post. The React port seeds
 * the inputs from the wizard session, posts to the JSON API and reproduces the
 * `afterValidation` behaviour (success closes the iframe/drawer).
 */

type Errors = Record<string, string[]>;

function ucwords(value: string): string {
  return value
    .split(" ")
    .map((word) =>
      word === "" ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

const API_ROOT = "/api/xhr/trongate_control-module_relations_builder";

const PAGE_CSS = `
.relation-summary {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1.5em;
}

.relation-summary td {
    border: 1px solid #ccc;
    padding: 8px 12px;
}

.relation-summary .row-key {
    width: 35%;
    background: #f4f4f4;
}

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

.form-column input {
    width: 100%;
}

.hint-text {
    font-size: .85em;
    color: #555;
    margin-top: 1.5em;
    text-align: left;
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

export default function ConfRelationDetails({ data }: TgViewProps) {
  const { csrfToken } = useTgUi();

  const wizard = (data.wizard ?? {}) as RelationsWizard;
  const afterCloseUrl = String(
    data.after_close_url ??
      "/trongate_control-module_relations_builder/conf_generate_relation?template=c64"
  );
  const afterCloseWidth = String(data.after_close_width ?? 800);
  const afterCloseHeight = String(data.after_close_height ?? 600);

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");

  const summaryRows: Array<[string, string]> = [
    ["Relation Type", ucwords(String(wizard.relation_type ?? ""))],
    [
      "Module A",
      `${wizard.parent_module ?? ""} (${wizard.singular_a ?? ""})`,
    ],
    [
      "Module B",
      `${wizard.child_module ?? ""} (${wizard.singular_b ?? ""})`,
    ],
    ["Bridging Table", wizard.bridging_table ? "Yes" : "No"],
  ];

  const closeWindow = () => {
    window.parent.postMessage(
      `reload_iframe:${afterCloseUrl}|${afterCloseWidth}|${afterCloseHeight}`,
      "*"
    );
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
      identifierColumnA: String(form.get("identifierColumnA") ?? ""),
      identifierColumnB: String(form.get("identifierColumnB") ?? ""),
      csrf_token: csrfToken,
    };

    try {
      const response = await fetch(`${API_ROOT}/submit_relation_details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

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
      <h1>Relation Details</h1>

      <table className="relation-summary">
        <tbody>
          {summaryRows.map(([label, value]) => (
            <tr key={label}>
              <td className="row-key">
                <strong>{label}</strong>
              </td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form
        action="#"
        className="highlight-errors sm"
        onSubmit={handleSubmit}
      >
        <div className="form-row">
          <div className="form-column">
            <label htmlFor="identifierColumnA-input">
              Identifier Column A
            </label>
            {fieldErrors("identifierColumnA")}
            <input
              type="text"
              name="identifierColumnA"
              id="identifierColumnA-input"
              autoComplete="off"
              defaultValue={wizard.identifier_column_a ?? ""}
            />
          </div>

          <div className="form-column">
            <label htmlFor="identifierColumnB-input">
              Identifier Column B
            </label>
            {fieldErrors("identifierColumnB")}
            <input
              type="text"
              name="identifierColumnB"
              id="identifierColumnB-input"
              autoComplete="off"
              defaultValue={wizard.identifier_column_b ?? ""}
            />
          </div>
        </div>

        <p className="hint-text">
          Identifier columns are used to describe a record in dropdowns and
          association panels. Comma-separated multi-column values are allowed.
        </p>

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
