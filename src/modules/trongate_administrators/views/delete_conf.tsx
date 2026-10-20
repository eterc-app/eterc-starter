import { TgForm } from "@/engine/ui/TgForm";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * Delete confirmation — port of
 * modules/trongate_administrators/views/delete_conf.php.
 *
 * Deletion happens only after the "Yes - Delete Now" submit; the controller
 * then re-checks ownership and record existence (PHP parity).
 */
export default function DeleteConf({ data }: TgViewProps) {
  const update_id = Number(data.update_id ?? 0);

  return (
    <>
      <h1>{String(data.headline ?? "")}</h1>
      <div className="card">
        <div className="card-heading">Confirmation Required</div>
        <div className="card-body">
          <p>Are you sure?</p>
          <p>
            You are about to delete a record. This cannot be undone. Do you really
            want to do this?
          </p>

          <TgForm action="trongate_administrators/submit_delete" params={[update_id]}>
            <div className="text-center">
              <a className="button alt" href={String(data.cancel_url ?? "")}>
                Cancel
              </a>
              <button type="submit" name="submit" value="Yes - Delete Now" className="danger">
                Yes - Delete Now
              </button>
            </div>
          </TgForm>
        </div>
      </div>
    </>
  );
}
