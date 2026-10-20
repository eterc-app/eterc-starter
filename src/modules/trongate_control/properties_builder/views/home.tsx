import type { TgViewProps } from "@/engine/views-registry";
import { PropertiesBuilder } from "../PropertiesBuilder";

/**
 * Properties Builder page — port of
 * modules/trongate_control/properties_builder/views/home.php.
 *
 * The original was a standalone HTML document. The port keeps the same
 * public asset paths (CSS/fonts/images already live in
 * public/trongate_control-properties_builder_module/) and mounts the React
 * builder.
 */

const ASSET_BASE = "/trongate_control-properties_builder_module";

export default function PropertiesBuilderHome({ data }: TgViewProps) {
  const apiBase =
    typeof data.api_base === "string" && data.api_base !== ""
      ? data.api_base
      : "/api/xhr";

  return (
    <>
      <link
        rel="stylesheet"
        href={`${ASSET_BASE}/css/w3.css`}
      />
      <link
        rel="stylesheet"
        href={`${ASSET_BASE}/css/properties_builder.css`}
      />
      {/*
        The original page was a standalone document that loaded only w3.css
        and properties_builder.css. The port renders inside the app root
        layout, which also loads the admin/framework stylesheets. Undo the few
        global rules that leak into this page (notably `.cloak`'s
        `display: none`, which would hide the whole fields selector).
      */}
      <style>{`
        html body {
          display: block;
          overflow: hidden;
          background-color: #000;
        }

        body .container {
          width: 1600px;
          max-width: none;
          margin: 0 auto;
          padding: 0;
        }

        body .cloak {
          display: block;
        }

        body .center-stage {
          width: auto;
          margin: 0;
          padding: 0;
        }

        body h2 {
          font-size: 1.4em;
          color: silver;
        }

        body button.accordion {
          margin: 0;
          border-radius: 0;
        }

        body .properties-selector button {
          margin: 0 0 0.8em 0;
        }

        body .accordion-content label.control {
          margin: 0 0 7px 0;
        }

        body .accordion-content button {
          margin: 1em 0 0 0;
        }

        body .modal-body {
          padding: 0.01em 16px 13em;
          border-inline: none;
          overflow-y: visible;
        }

        body .modal-body button {
          margin: 0;
        }
      `}</style>
      <PropertiesBuilder apiBase={apiBase} />
    </>
  );
}
