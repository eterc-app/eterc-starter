"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { BASE_URL } from "@/engine/config";
import { useEtUi } from "@/engine/ui/EtUiProvider";
import { Button } from "@/components/ui/button";
import type { PanelBodyData } from "./types";

/**
 * PanelBody — the live content of an "Associated …" summary panel.
 *
 * Port of modules/module_relations/views/panel_body.php. The PHP view is TWO
 * panel-scoped regions (associate form + associated-items list) that MX swaps
 * out of band after add/remove. Here the same two regions are rendered from
 * React state: a mutation posts JSON to /api/xhr/module_relations/* with
 * `format: "json"` and the controller answers with the fresh panel data, which
 * replaces this component's state. Selector discipline from the PHP view is
 * kept: everything is scoped by the unique panel id, never by
 * `.associated-items` alone.
 */

interface XhrReply {
  status: string;
  data?: { ok?: boolean; message?: string; panel?: PanelBodyData };
  message?: string;
}

export function PanelBody({ data }: { data: PanelBodyData }) {
  const { csrf_token } = useEtUi();
  const [panel, setPanel] = useState<PanelBodyData>(data);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const token = panel.csrf_token !== "" ? panel.csrf_token : csrf_token;

  const call = async (
    method: "submit_association" | "remove_association",
    target: number
  ) => {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/xhr/module_relations/${method}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          calling_module: panel.calling_module,
          alt_module: panel.alt_module,
          update_id: panel.update_id,
          value: target,
          panel_id: panel.panel_id,
          csrf_token: token,
          format: "json",
        }),
      });

      const json = (await response.json()) as XhrReply;

      if (json.status !== "ok") {
        setError(json.message || "The request could not be completed.");
        return;
      }

      if (!json.data || json.data.ok !== true || !json.data.panel) {
        setError(
          json.data?.message || "The association panel could not be updated."
        );
        return;
      }

      setPanel(json.data.panel);
      setValue("");
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const relation_name = panel.relation_name || panel.panel_id;

  return (
    <div aria-busy={busy} className="space-y-4">
      <div id={`rel-${panel.panel_id}-associate-form`} className="space-y-3">
        {panel.form_visible ? (
          <form
            action="#"
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (value === "") return;
              void call("submit_association", Number(value));
            }}
          >
            <label
              htmlFor={`${relation_name}-dropdown`}
              className="text-sm font-medium"
            >
              Associate with{" "}
              {ucwords(panel.associated_singular.replace(/_/g, " "))}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                id={`${relation_name}-dropdown`}
                name="value"
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                disabled={busy}
              >
                <option value="">Select...</option>
                {panel.available_options.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.value}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={busy || value === ""}>
                Add
              </Button>
            </div>
          </form>
        ) : panel.available_options.length === 0 &&
          panel.associated_rows.length === 0 ? (
          panel.associated_singular !== "" && panel.calling_singular !== "" ? (
            <p className="text-sm text-muted-foreground">
              There are currently no{" "}
              {panel.associated_singular.replace(/_/g, " ")} records available to
              assign to this {panel.calling_singular.replace(/_/g, " ")}.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No records are currently available for assignment.
            </p>
          )
        ) : null}

        {error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div id={`rel-${panel.panel_id}-associated-items`}>
        {panel.associated_rows.length > 0 ? (
          <ul className="divide-y rounded-md border">
            {panel.associated_rows.map((row) => (
              <li
                className="flex items-center justify-between gap-2 px-3 py-2"
                key={row.id}
              >
                <a
                  href={`${base}${panel.alt_module}/show/${row.foreign_key}`}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {row.value}
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${row.value}`}
                  disabled={busy}
                  onClick={() => void call("remove_association", row.id)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** PHP ucwords(). */
function ucwords(value: string): string {
  return value
    .split(" ")
    .map((word) => (word === "" ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}
