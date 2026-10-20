import type { TgViewProps } from "@/engine/views-registry";

/**
 * Record not found — port of
 * modules/trongate_administrators/views/not_found.php.
 */
export default function NotFound({ data }: TgViewProps) {
  const headline = String(data.headline ?? "");

  return (
    <>
      <h1>{headline}</h1>
      <div className="card">
        <div className="card-heading">{headline}</div>
        <div className="card-body">
          <p>{String(data.message ?? "")}</p>
          <div className="text-center">
            <a className="button alt" href={String(data.back_url ?? "")}>
              {String(data.back_label ?? "")}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
