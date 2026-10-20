import { TgForm } from "@/engine/ui/TgForm";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * Delete confirmation — the `db` module's pre-deletion page.
 *
 * Rendered by DbAdmin::delete_conf() with
 * { headline, table, update_id, preview, cancel_url }. The preview is a short
 * read-only excerpt of the record being deleted (label/value pairs supplied by
 * the controller). Deletion only happens on "Yes - Delete Now".
 */

interface PreviewItem {
  label: string;
  value: string;
}

export default function DeleteConf({ data }: TgViewProps) {
  const table = String(data.table ?? "");
  const update_id = Number(data.update_id ?? 0);
  const preview = (data.preview ?? []) as PreviewItem[];

  return (
    <>
      <h1>{String(data.headline ?? "")}</h1>

      <div className="card">
        <div className="card-heading">Confirmation Required</div>
        <div className="card-body">
          <p>Are you sure?</p>
          <p>
            You are about to delete record #{update_id} from &apos;{table}&apos;.
            This cannot be undone. Do you really want to do this?
          </p>

          {preview.length > 0 ? (
            <div className="detail-grid">
              <div className="detail-block">
                {preview.map((item) => (
                  <div className="detail-row" key={item.label}>
                    <span className="detail-label">{item.label}</span>
                    <span className="detail-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <TgForm action="db/submit_delete" params={[table, update_id]}>
            <div className="text-center">
              <a className="button alt" href={String(data.cancel_url ?? "")}>
                Cancel
              </a>
              <button
                type="submit"
                name="submit"
                value="Yes - Delete Now"
                className="danger"
              >
                Yes - Delete Now
              </button>
            </div>
          </TgForm>
        </div>
      </div>
    </>
  );
}
