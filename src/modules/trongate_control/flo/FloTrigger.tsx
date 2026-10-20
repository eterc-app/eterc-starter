"use client";

import { useCallback, useEffect, useState } from "react";
import { BASE_URL } from "@/engine/config";

/**
 * Flo launcher — port of
 * modules/trongate_control/flo/views/flo_trigger.php.
 *
 * The PHP trigger relied on the framework's MX modal and a global
 * `window` message listener. The React version keeps the same button artwork
 * and postMessage protocol, but renders its overlays as fixed-position
 * iframes. All interactive requests still go through the port's JSON API
 * (`/api/xhr/...`), never through PHP-style form posts.
 */

/** Respect BASE_URL without importing the server-only request context. */
const BASE = BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/";

const FLO_HOME = `${BASE}trongate_control-flo/home`;
const QUERY_BUILDER_HOME = `${BASE}trongate_control-query_builder/home`;
const PROPERTIES_BUILDER_HOME = `${BASE}trongate_control-properties_builder/web`;
const STORE_PROPERTIES_URL = `${BASE}api/xhr/trongate_control-module_builder/store_properties`;

interface OverlayState {
  url: string;
  title: string;
  width: number;
  height: number;
}

/** Parse a postMessage dimension, falling back to the PHP defaults. */
function dimension(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const FLO_CSS = `
.flo-btn-container {
    width: 100%;
    text-align: center;
    padding: 20px 0;
    margin-top: 12px;
}
.flo-flagship-div-trigger {
    width: 162px;
    height: 51px;
    display: inline-block;
    background: url('${BASE}trongate_control_module/images/flo_button.png') no-repeat center center;
    background-size: contain;
    border-radius: 12px;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(16, 184, 255, 0.5);
    animation: floPulse 3s infinite ease-in-out;
    transition: transform 0.2s, box-shadow 0.2s;
    border: 1px #4e85b5 solid;
    opacity: .5;
}
.flo-flagship-div-trigger:hover {
    transform: scale(1.04);
    box-shadow: 0 0 20px rgba(16, 184, 255, 0.8);
    opacity: 1;
}
.flo-flagship-div-trigger:active { transform: scale(0.96); }
.flo-flagship-div-trigger:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 4px;
}
.flo-overlay,
.flo-pb-overlay {
    position: fixed;
    inset: 0;
    z-index: 1001;
    background: rgba(0, 0, 0, 0.5);
}
.flo-modal,
.flo-pb-modal {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
    max-width: 96vw;
    max-height: 96vh;
}
.flo-modal { background: #fff; }
.flo-pb-modal { width: 96vw; height: 96vh; background: transparent; }
.flo-modal iframe,
.flo-pb-modal iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
    border-radius: 12px;
    background: #000;
}
.flo-close {
    position: absolute;
    top: 6px;
    right: 12px;
    z-index: 2;
    cursor: pointer;
    color: #fff;
    background: #ff744a;
    border: none;
    border-radius: 4px;
    font-size: 20px;
    line-height: 1;
    padding: 2px 8px;
}
@keyframes floPulse {
    0% { box-shadow: 0 0 10px rgba(16, 184, 255, 0.4); }
    50% { box-shadow: 0 0 22px rgba(16, 184, 255, 0.8); }
    100% { box-shadow: 0 0 10px rgba(16, 184, 255, 0.4); }
}
`;

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

  // -------------------------------------------------------------------------
  // postMessage protocol (same messages as flo_trigger.php)
  // -------------------------------------------------------------------------
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

        // PHP toggles the overlay: a second message removes an open one.
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
      <div className="flo-btn-container">
        <div
          className="flo-flagship-div-trigger"
          aria-label="Open Flo"
          role="button"
          tabIndex={0}
          onClick={openFlo}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openFlo();
            }
          }}
        />
      </div>

      {overlay ? (
        <div
          className="flo-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOverlay(null);
          }}
        >
          <div
            className="flo-modal"
            style={{ width: overlay.width, height: overlay.height }}
          >
            <iframe src={overlay.url} title={overlay.title} />
          </div>
        </div>
      ) : null}

      {propertiesOpen ? (
        <div
          className="flo-pb-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPropertiesOpen(false);
          }}
        >
          <div className="flo-pb-modal">
            <button
              type="button"
              className="flo-close"
              aria-label="Close Properties Builder"
              onClick={() => setPropertiesOpen(false)}
            >
              &times;
            </button>
            <iframe src={PROPERTIES_BUILDER_HOME} title="Properties Builder" />
          </div>
        </div>
      ) : null}

      <style>{FLO_CSS}</style>
    </>
  );
}

export default FloTrigger;
