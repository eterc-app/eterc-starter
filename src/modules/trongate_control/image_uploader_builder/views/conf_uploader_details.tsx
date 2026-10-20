"use client";

import type { TgViewProps } from "@/engine/views-registry";
import { UPLOADER_DEFAULTS, type UploaderWizard } from "../types";

/**
 * Read-only uploader summary — port of
 * image_uploader_builder/views/conf_uploader_details.php.
 *
 * The PHP view seeded its table from localStorage; the port takes the same
 * values from the wizard session passed by the controller. There is no form:
 * the copy tells the developer the settings file can be edited after
 * generation.
 */

const PAGE_CSS = `
/* Undo the global stylesheet's table rules (same overrides as the original). */
body table {
  border-collapse: separate;
  width: auto;
}

body table th {
  background-color: transparent;
  color: inherit;
}

body table th,
body table td {
  border: none;
  padding: 0;
}

body table tr,
body table tr:nth-child(odd),
body table tr:hover,
body table tr:nth-child(odd):hover {
  background-color: transparent;
}

.iu-summary {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1.5em;
}

.iu-summary td {
    border: 1px solid #ccc;
    padding: 8px 12px;
}

.iu-summary .row-key {
    width: 35%;
    background: #f4f4f4;
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

export default function ConfUploaderDetails({ data }: TgViewProps) {
  const wizard = (data.wizard ?? {}) as UploaderWizard;

  const afterCloseUrl = String(
    data.after_close_url ??
      "/trongate_control-image_uploader_builder/conf_generate_uploader"
  );
  const afterCloseWidth = String(data.after_close_width ?? 800);
  const afterCloseHeight = String(data.after_close_height ?? 600);

  const closeWindow = () => {
    window.parent.postMessage(
      `reload_iframe:${afterCloseUrl}|${afterCloseWidth}|${afterCloseHeight}`,
      "*"
    );
    if (typeof window !== "undefined" && window.parent === window) {
      window.location.href = afterCloseUrl;
    }
  };

  const rows: Array<[string, string | number]> = [
    ["Module", String(data.module_label ?? wizard.module ?? "")],
    ["Column Name", wizard.column ?? UPLOADER_DEFAULTS.column],
    ["Table Name", wizard.table ?? wizard.module ?? ""],
    ["Destination Folder", wizard.destination ?? UPLOADER_DEFAULTS.destination],
    ["Max Upload Size (KB)", wizard.max_size ?? UPLOADER_DEFAULTS.max_size],
    ["Max Source Width (px)", wizard.max_width ?? UPLOADER_DEFAULTS.max_width],
    [
      "Max Source Height (px)",
      wizard.max_height ?? UPLOADER_DEFAULTS.max_height,
    ],
    [
      "Downscale-to Width (px)",
      wizard.resize_max_width ?? UPLOADER_DEFAULTS.resize_max_width,
    ],
    [
      "Downscale-to Height (px)",
      wizard.resize_max_height ?? UPLOADER_DEFAULTS.resize_max_height,
    ],
    [
      "Thumbnail Max Width (px)",
      wizard.thumbnail_max_width ?? UPLOADER_DEFAULTS.thumbnail_max_width,
    ],
    [
      "Thumbnail Max Height (px)",
      wizard.thumbnail_max_height ?? UPLOADER_DEFAULTS.thumbnail_max_height,
    ],
    [
      "Generate Thumbnail",
      (wizard.thumbnails ?? UPLOADER_DEFAULTS.thumbnails) ? "Yes" : "No",
    ],
  ];

  return (
    <div className="container">
      <h1>Image Uploader Details</h1>
      <p>
        Your uploader details are displayed below. If required, you can modify
        these details after generation via the settings file.
      </p>

      <table className="iu-summary">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="row-key">
                <strong>{label}</strong>
              </td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-center form-buttons">
        <button type="button" className="close-btn alt" onClick={closeWindow}>
          Close Window
        </button>
      </div>

      <style>{PAGE_CSS}</style>
    </div>
  );
}
