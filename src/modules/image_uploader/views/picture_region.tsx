"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { tgSubmit } from "@/app/actions";
import { useTgUi } from "@/engine/ui/TgUiProvider";

/**
 * Picture region — the interactive body of the show-page "Picture" card.
 *
 * Client component because removing a picture is a stateful action in the
 * port: PHP used a Trongate MX POST with an out-of-band swap, while the port
 * posts through the tgSubmit server action and replaces this component's
 * subtree with the re-rendered region. Upload/Replace stay plain links to
 * the dedicated multipart upload page.
 *
 * The server-rendered markup mirrors modules/image_uploader/views/
 * panel_body.php: the empty state with an Upload action, or the preview
 * (thumbnail when enabled) with Replace/Remove actions.
 */

export interface PictureRegionProps {
  data: Record<string, unknown>;
}

export function PictureRegion({ data }: PictureRegionProps) {
  const module = String(data.module ?? "");
  const update_id = Number(data.update_id ?? 0);
  const panel_id = String(data.panel_id ?? "");
  const file_name = String(data.file_name ?? "");
  const thumbnails = data.thumbnails === true;
  const upload_url = String(data.upload_url ?? "");
  const picture_url = String(data.picture_url ?? "");
  const thumbnail_url = String(data.thumbnail_url ?? "");
  const initial_csrf_token = String(data.csrf_token ?? "");

  const { csrfToken } = useTgUi();
  const [reply, setReply] = useState<ReactNode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRemove = () => {
    const formData = new FormData();
    formData.set("_tg_action", "image_uploader/remove_picture");
    formData.set("_tg_params", "[]");
    formData.set("module", module);
    formData.set("update_id", String(update_id));
    formData.set("panel_id", panel_id);
    formData.set("csrf_token", csrfToken || initial_csrf_token);

    startTransition(async () => {
      const result = await tgSubmit(formData);

      if (result.kind === "node") {
        setErrorMessage(null);
        setReply(result.node);
      } else if (result.kind === "error") {
        setErrorMessage(result.message);
      }
    });
  };

  if (reply) {
    return <>{reply}</>;
  }

  return (
    <div id={`iu-${panel_id}-body`}>
      {file_name === "" ? (
        <>
          <p className="picture-panel__empty">No picture has been uploaded yet.</p>
          <a href={upload_url} className="button">
            Upload Picture
          </a>
        </>
      ) : (
        <>
          <div className="picture-panel__preview">
            <img
              src={thumbnails ? thumbnail_url : picture_url}
              alt="Picture preview"
              className="picture-panel__img"
            />
            <div className="picture-panel__filename sm">{file_name}</div>
          </div>
          <div className="picture-panel__actions">
            <a href={upload_url} className="button alt">
              Replace Picture
            </a>
            <button
              type="button"
              className="button danger"
              aria-label="Remove picture"
              onClick={handleRemove}
              disabled={isPending}
            >
              Remove
            </button>
          </div>
        </>
      )}

      {errorMessage ? (
        <p style={{ color: "red" }} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

export default PictureRegion;
