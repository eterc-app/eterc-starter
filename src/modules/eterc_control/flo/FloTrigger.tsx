"use client";

import { useCallback, useEffect, useState } from "react";
import { BASE_URL } from "@/engine/config";
import { Button } from "@/components/ui/button";
import { Wand2, X } from "lucide-react";

/** Respect BASE_URL without importing the server-only request context. */
const BASE = BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/";

const FLO_HOME = `${BASE}control/flo/home`;
const QUERY_BUILDER_HOME = `${BASE}control/query-builder/home`;
const PROPERTIES_BUILDER_HOME = `${BASE}control/properties-builder/web`;
const STORE_PROPERTIES_URL = `${BASE}api/xhr/eterc_control-module_builder/store_properties`;

interface OverlayState {
  url: string;
  title: string;
  width: number;
  height: number;
}
function dimension(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type FloWindow = Window & {
  openPropertiesBuilder?: () => void;
};

export function FloTrigger() {
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);

  const openOverlay = useCallback(
    (url: string, title: string, width = 800, height = 600) => {
      setOverlay({ url, title, width, height });
    },
    []
  );

  const openPropertiesBuilder = useCallback(() => {
    setPropertiesOpen(true);
  }, []);

  const closeAll = useCallback(() => {
    setOverlay(null);
    setPropertiesOpen(false);
  }, []);

  const handlePropertiesSubmitted = useCallback(async () => {
    setPropertiesOpen(false);

    let propertiesData = "[]";
    try {
      propertiesData = localStorage.getItem("properties") ?? "[]";
    } catch {
      propertiesData = "[]";
    }

    try {
      const response = await fetch(STORE_PROPERTIES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: propertiesData,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      openOverlay(FLO_HOME, "Flo");
    } catch {
      window.alert("Failed to save properties. Please try again.");
    }
  }, [openOverlay]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (typeof data !== "string") return;

      if (data.startsWith("open_url:")) {
        const [url, target] = data.replace("open_url:", "").split("|");
        if (url) window.open(url, target || "_blank");
        return;
      }

      if (data.startsWith("reload_iframe:")) {
        const [url, rawWidth, rawHeight] = data
          .replace("reload_iframe:", "")
          .split("|");
        if (!url) return;

        setOverlay((current) =>
          current
            ? null
            : {
                url,
                title: "Flo Wizard",
                width: dimension(rawWidth, 1000),
                height: dimension(rawHeight, 800),
              }
        );
        return;
      }

      if (data === "reset") {
        try {
          localStorage.removeItem("flo_wizard_state");
          localStorage.removeItem("properties");
        } catch {
          /* storage may be unavailable */
        }
        closeAll();
        window.setTimeout(() => openOverlay(FLO_HOME, "Flo"), 100);
        return;
      }

      if (data === "open_query_builder") {
        openOverlay(QUERY_BUILDER_HOME, "Query Builder");
        return;
      }

      if (data === "close_query_builder") {
        setOverlay((current) =>
          current && current.url.startsWith(QUERY_BUILDER_HOME) ? null : current
        );
        return;
      }

      if (data === "open_properties_builder") {
        setOverlay(null);
        openPropertiesBuilder();
        return;
      }

      if (data === "properties_submitted") {
        void handlePropertiesSubmitted();
        return;
      }

      if (data === "close_properties_builder" || data === "close") {
        closeAll();
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    closeAll,
    handlePropertiesSubmitted,
    openOverlay,
    openPropertiesBuilder,
  ]);

  // Sibling modules call window.openPropertiesBuilder() from mx-loaded
  // fragments, exactly like the original trigger script exposed it.
  useEffect(() => {
    const floWindow = window as FloWindow;
    floWindow.openPropertiesBuilder = openPropertiesBuilder;
    return () => {
      delete floWindow.openPropertiesBuilder;
    };
  }, [openPropertiesBuilder]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAll();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeAll]);

  const openFlo = () => {
    try {
      localStorage.removeItem("flo_wizard_state");
    } catch {
      /* storage may be unavailable */
    }
    openOverlay(FLO_HOME, "Flo");
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={openFlo}
        className="h-auto w-full justify-start gap-2 border-slate-700 bg-slate-900 px-3 py-2 text-white hover:bg-slate-800 hover:text-white"
        aria-label="Open Flo"
      >
        <Wand2 className="size-4" />
        <span className="font-semibold">Flo</span>
        <span className="ml-auto text-xs text-slate-400">Generator</span>
      </Button>

      {overlay ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOverlay(null);
          }}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-[min(1100px,95vw)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
            style={{
              width: overlay.width,
              height: overlay.height,
              maxWidth: "95vw",
              maxHeight: "90vh",
            }}
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b bg-muted/50 px-3">
              <span className="text-sm font-medium">{overlay.title}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Close"
                onClick={() => setOverlay(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <iframe
              src={overlay.url}
              title={overlay.title}
              className="h-full w-full flex-1 border-0 bg-background"
            />
          </div>
        </div>
      ) : null}

      {propertiesOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPropertiesOpen(false);
          }}
        >
          <div className="relative flex h-[min(800px,90vh)] w-full max-w-[min(1100px,95vw)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
            <div className="flex h-10 shrink-0 items-center justify-between border-b bg-muted/50 px-3">
              <span className="text-sm font-medium">Properties Builder</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Close Properties Builder"
                onClick={() => setPropertiesOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <iframe
              src={PROPERTIES_BUILDER_HOME}
              title="Properties Builder"
              className="h-full w-full flex-1 border-0 bg-background"
            />
          </div>
        </div>
      ) : null}
    </>
  );}

export default FloTrigger;
