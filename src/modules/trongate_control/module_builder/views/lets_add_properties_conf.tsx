"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h2>Now Add Some Properties</h2>
      <Button type="button" onClick={openBuilder}>
        Okay
      </Button>

      <div className="space-y-2">
        <Label htmlFor="properties-json">Properties (JSON)</Label>
        <Textarea
          id="properties-json"
          rows={12}
          className="min-h-48 font-mono"
          value={propertiesJson}
          onChange={(event) => setPropertiesJson(event.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => onContinue(propertiesJson)}
      >
        Continue
      </Button>

      {builderOpen ? (
        <div
          role="dialog"
          aria-label="Properties Builder"
          className="fixed inset-0 z-[1000] bg-black/60"
        >
          <iframe
            src="/control/properties-builder/web"
            title="Properties Builder"
            className="h-full w-full border-0 bg-white"
          />
        </div>
      ) : null}
    </div>
  );
}
