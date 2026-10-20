import { Flashdata } from "@/engine/ui/Flashdata";
import { TgForm } from "@/engine/ui/TgForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * Image Uploader — dedicated upload page (runtime).
 * Port of modules/image_uploader/views/upload_form.php.
 *
 * A full page for one record so a large upload is an ordinary multipart
 * form submission. The PHP original posted a plain multipart form to
 * submit_upload(); the port uses <TgForm> with encType="multipart/form-data"
 * (a server action that carries the same FormData), which is the port's
 * equivalent for real file transfers.
 *
 * Expects: headline, module, update_id, current_file_name,
 *          current_picture_url, cancel_url.
 */
export default function UploadForm({ data }: TgViewProps) {
  const module = String(data.module ?? "");
  const update_id = Number(data.update_id ?? 0);
  const current_file_name = String(data.current_file_name ?? "");
  const current_picture_url = String(data.current_picture_url ?? "");
  const cancel_url = String(data.cancel_url ?? "");

  return (
    <>
      <h1>{String(data.headline ?? "Upload Picture")}</h1>
      <Flashdata />
      <ValidationErrors />

      <div className="card">
        <div className="card-heading">Picture</div>
        <div className="card-body">
          {current_file_name !== "" ? (
            <div className="picture-upload__current">
              <img
                src={current_picture_url}
                alt="Current picture"
                className="picture-upload__current-img"
              />
              <p>Current picture: {current_file_name}</p>
              <p>Uploading a new picture replaces the current one.</p>
            </div>
          ) : null}

          <TgForm
            action="image_uploader/submit_upload"
            hidden={{ module: module, update_id: update_id }}
            encType="multipart/form-data"
          >
            <label>Picture</label>
            <input
              type="file"
              name="picture"
              accept="image/jpeg,image/png,image/gif,image/webp"
              required
            />

            <div className="text-center">
              <a className="button alt" href={cancel_url}>
                Cancel
              </a>
              <button type="submit" name="submit" value="Upload Picture">
                Upload Picture
              </button>
            </div>
          </TgForm>
        </div>
      </div>
    </>
  );
}
