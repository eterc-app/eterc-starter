"use client";

import { useEffect, useState } from "react";

/**
 * Step 3 — port of module_builder/views/lets_add_properties_conf.php.
 *
 * The PHP view opened the Properties Builder in a Flo shell overlay; the
 * builder reported back through the postMessage/localStorage protocol. The port
 * keeps that protocol and embeds the ported builder directly as an overlay, so
 * the "Okay" button behaves like the original. The JSON editor remains as a
 * fallback (and for paste/import).
 */
export function LetsAddPropertiesConfStep({
  initialProperties,
  onOkay,
  onContinue,
  busy,
  error,
}: {
  initialProperties: string;
  onOkay: () => void;
  onContinue: (propertiesJson: string) => void;
  busy: boolean;
  error?: string;
}) {
  const [propertiesJson, setPropertiesJson] = useState(initialProperties);
  const [builderOpen, setBuilderOpen] = useState(false);

  // Listen for the Properties Builder's postMessage protocol. When it posts
  // `properties_submitted`, it has already written the reduced list to
  // localStorage.properties (same origin); mirror that into the editor.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data === "open_properties_builder") {
        setBuilderOpen(true);
        return;
      }

      if (event.data === "properties_submitted") {
        try {
          const raw = window.localStorage.getItem("properties");
          const parsed: unknown = raw === null ? null : JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setPropertiesJson(JSON.stringify(parsed, null, 2));
          }
        } catch {
          /* keep the current editor contents */
        }
        setBuilderOpen(false);
        return;
      }

      if (event.data === "close") {
        setBuilderOpen(false);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const openBuilder = () => {
    onOkay();
    setBuilderOpen(true);
  };

  return (
    <div className="center-stage">
      <div className="mt-1">Now Add Some Properties</div>
      <div className="mt-1">
        <button type="button" onClick={openBuilder}>
          Okay
        </button>
      </div>

      <div className="mt-1">
        <label htmlFor="properties-json">Properties (JSON)</label>
        <textarea
          id="properties-json"
          rows={12}
          style={{ width: "100%", fontFamily: "monospace" }}
          value={propertiesJson}
          onChange={(event) => setPropertiesJson(event.target.value)}
        />
      </div>
      {error ? <p style={{ color: "#b00020" }}>{error}</p> : null}
      <div className="mt-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => onContinue(propertiesJson)}
        >
          Continue
        </button>
      </div>

      {builderOpen ? (
        <div
          role="dialog"
          aria-label="Properties Builder"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.6)",
          }}
        >
          <iframe
            src="/trongate_control-properties_builder/web"
            title="Properties Builder"
            style={{
              width: "100%",
              height: "100%",
              border: "0",
              background: "#fff",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
