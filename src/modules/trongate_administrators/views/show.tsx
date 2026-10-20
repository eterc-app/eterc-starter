import { Flashdata } from "@/engine/ui/Flashdata";
import { siteUrl } from "@/engine/url";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * Record details — port of
 * modules/trongate_administrators/views/show.php.
 */
export default function Show({ data }: TgViewProps) {
  const update_id = Number(data.update_id ?? 0);
  const is_own_account = data.is_own_account === true;

  return (
    <>
      <h1>{String(data.headline ?? "")}</h1>
      <Flashdata />
      <div className="card">
        <div className="card-heading">Record Details</div>
        <div className="card-body">
          <div className="text-right mb-3">
            <a className="button alt" href={String(data.back_url ?? "")}>
              Back
            </a>
            <a
              className="button"
              href={siteUrl(`trongate_administrators/create/${update_id}`)}
            >
              Edit
            </a>
            {is_own_account === false ? (
              <a
                className="button danger"
                href={siteUrl(`trongate_administrators/delete_conf/${update_id}`)}
              >
                Delete
              </a>
            ) : null}
          </div>

          <div className="detail-grid">
            <div className="detail-row">
              <div className="detail-label">Username</div>
              <div className="detail-value">{String(data.username ?? "")}</div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Trongate User ID</div>
              <div className="detail-value">
                {String(data.trongate_user_id ?? "")}
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Status</div>
              <div className="detail-value">
                {String(data.active_formatted ?? "")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
