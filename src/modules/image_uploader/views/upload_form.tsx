import { Flashdata } from "@/engine/ui/Flashdata";
import { EtForm } from "@/engine/ui/EtForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import type { EtViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/**
 * Image Uploader — dedicated upload page (runtime).
 * Port of modules/image_uploader/views/upload_form.php.
 *
 * A full page for one record so a large upload is an ordinary multipart
 * form submission. The PHP original posted a plain multipart form to
 * submit_upload(); the port uses <EtForm> with encType="multipart/form-data"
 * (a server action that carries the same FormData), which is the port's
 * equivalent for real file transfers.
 *
 * Expects: headline, module, update_id, current_file_name,
 *          current_picture_url, cancel_url.
 */
export default function UploadForm({ data }: EtViewProps) {
  const module = String(data.module ?? "");
  const update_id = Number(data.update_id ?? 0);
  const current_file_name = String(data.current_file_name ?? "");
  const current_picture_url = String(data.current_picture_url ?? "");
  const cancel_url = String(data.cancel_url ?? "");

  return (
    <div className="space-y-6">
      <h1>{String(data.headline ?? "Upload Picture")}</h1>
      <Flashdata />
      <ValidationErrors />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Picture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          {current_file_name !== "" ? (
            <div className="space-y-2 rounded-md border bg-muted/30 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current_picture_url}
                alt="Current picture"
                className="max-h-48 w-auto rounded-md border bg-background object-contain"
              />
              <p className="text-sm font-medium">
                Current picture: {current_file_name}
              </p>
              <p className="text-sm text-muted-foreground">
                Uploading a new picture replaces the current one.
              </p>
            </div>
          ) : null}

          <EtForm
            action="image_uploader/submit_upload"
            hidden={{ module: module, update_id: update_id }}
            encType="multipart/form-data"
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="image-uploader-picture">Picture</Label>
              <input
                id="image-uploader-picture"
                type="file"
                name="picture"
                accept="image/jpeg,image/png,image/gif,image/webp"
                required
                className="block w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-sm file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm file:font-medium file:text-foreground"
              />
            </div>

            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
              <Button asChild variant="outline">
                <a href={cancel_url}>Cancel</a>
              </Button>
              <Button type="submit" name="submit" value="Upload Picture">
                Upload Picture
              </Button>
            </div>
          </EtForm>
        </CardContent>
      </Card>
    </div>
  );
}
