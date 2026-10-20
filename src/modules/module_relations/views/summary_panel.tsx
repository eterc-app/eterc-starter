"use client";

import { useEffect, useState } from "react";
import type { TgViewProps } from "@/engine/views-registry";
import { PanelBody } from "./PanelBody";
import type { PanelBodyData } from "./types";

/**
 * summary_panel — the "Associated …" panel shell on a generated show page.
 *
 * Port of modules/module_relations/views/summary_panel.php. The PHP shell seeds
 * its MX context as custom headers on the unique-ID container and lets MX
 * fetch the live content on load. The port does the same fetch from an effect:
 * POST /api/xhr/module_relations/render_panel_body with the same X-* context
 * (headlessly also mirrored in the JSON body), `format: "json"` asking for the
 * panel data instead of an HTML fragment.
 */

interface XhrReply {
  status: string;
  data?: { ok?: boolean; message?: string; panel?: PanelBodyData };
  message?: string;
}

export default function SummaryPanel({ data }: TgViewProps) {
  const summary_panel_id = String(data.summary_panel_id ?? "");
  const calling_module = String(data.calling_module ?? "");
  const alt_module = String(data.alt_module ?? "");
  const update_id = Number(data.update_id ?? 0);
  const card_heading = String(data.card_heading ?? "");

  const [panel, setPanel] = useState<PanelBodyData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          "/api/xhr/module_relations/render_panel_body",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest",
              "X-Calling-Module": calling_module,
              "X-Alt-Module": alt_module,
              "X-Update-ID": String(update_id),
              "X-Panel-ID": summary_panel_id,
            },
            body: JSON.stringify({
              calling_module: calling_module,
              alt_module: alt_module,
              update_id: update_id,
              panel_id: summary_panel_id,
              format: "json",
            }),
          }
        );

        const json = (await response.json()) as XhrReply;
        if (cancelled) return;

        if (json.status === "ok" && json.data?.ok === true && json.data.panel) {
          setPanel(json.data.panel);
        } else {
          setError(
            json.message ||
              json.data?.message ||
              "The associated records could not be loaded."
          );
        }
      } catch {
        if (!cancelled) {
          setError("A network error occurred. Please try again.");
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [calling_module, alt_module, update_id, summary_panel_id]);

  return (
    <div className="card">
      <div className="card-heading">{card_heading}</div>
      <div className="card-body">
        {panel === null && error === "" ? (
          <div
            className={`spinner mx-indicator indicator-${summary_panel_id}`}
          ></div>
        ) : null}

        <div id={summary_panel_id}>
          {error !== "" ? (
            <p className="associated-items__empty" role="alert">
              {error}
            </p>
          ) : null}
          {panel !== null ? <PanelBody data={panel} /> : null}
        </div>
      </div>
    </div>
  );
}
