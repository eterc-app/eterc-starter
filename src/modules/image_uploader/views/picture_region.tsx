"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { etSubmit } from "@/app/actions";
import { useEtUi } from "@/engine/ui/EtUiProvider";
import { Button } from "@/components/ui/button";

/**
 * Picture region — the interactive body of the show-page "Picture" card.
 *
 * Client component because removing a picture is a stateful action in the
 * port: PHP used a Eterc MX POST with an out-of-band swap, while the port
 * posts through the etSubmit server action and replaces this component's
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

  const { csrf_token } = useEtUi();
  const [reply, setReply] = useState<ReactNode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRemove = () => {
    const formData = new FormData();
    formData.set("_et_action", "image_uploader/remove_picture");
    formData.set("_et_params", "[]");
    formData.set("module", module);
    formData.set("update_id", String(update_id));
    formData.set("panel_id", panel_id);
    formData.set("csrf_token", csrf_token || initial_csrf_token);

    startTransition(async () => {
      const result = await etSubmit(formData);

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
    <div id={`iu-${panel_id}-body`} className="space-y-4">
      {file_name === "" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No picture has been uploaded yet.
          </p>
          <Button asChild>
            <a href={upload_url}>Upload Picture</a>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnails ? thumbnail_url : picture_url}
              alt="Picture preview"
              className="max-h-48 w-auto rounded-md border bg-muted object-contain"
            />
            <p className="break-all text-sm text-muted-foreground">
              {file_name}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={upload_url}>Replace Picture</a>
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              aria-label="Remove picture"
              onClick={handleRemove}
              disabled={isPending}
            >
              {isPending ? "Removing…" : "Remove"}
            </Button>
          </div>
        </div>
      )}

      {errorMessage ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

export default PictureRegion;
