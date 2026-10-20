import type { TgViewProps } from "@/engine/views-registry";

/**
 * Database resource not found.
 *
 * Rendered by DbAdmin::not_found(); mirrors the administrators module's
 * not_found view using the db controller's data contract
 * { headline, message, back_url, back_label }.
 */
export default function NotFound({ data }: TgViewProps) {
  const headline = String(data.headline ?? "Not Found");

  return (
    <>
      <h1>{headline}</h1>
      <div className="card">
        <div className="card-heading">{headline}</div>
        <div className="card-body">
          <p>{String(data.message ?? "")}</p>
          <div className="text-center">
            <a className="button alt" href={String(data.back_url ?? "")}>
              {String(data.back_label ?? "Go Back")}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
