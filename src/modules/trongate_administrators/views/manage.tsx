import { BASE_URL } from "@/engine/config";
import { Flashdata } from "@/engine/ui/Flashdata";
import type { TgViewProps } from "@/engine/views-registry";
import { Pagination } from "@/modules/pagination/PaginationRenderer";
import { PerPageSelect } from "./PerPageSelect";

/**
 * Manage administrators — port of
 * modules/trongate_administrators/views/manage.php.
 *
 * Rendered on the server: the pagination is the canonical pagination module
 * (it reads the request context to resolve the current page), and the only
 * interactive part — the "Records Per Page" selector — is <PerPageSelect>,
 * a small client component that navigates to
 * {module}/set_per_page/{index} exactly like the PHP view's inline script.
 */
export default function Manage({ data }: TgViewProps) {
  const rows = (data.rows ?? []) as Array<Record<string, unknown>>;
  const pagination_data = (data.pagination_data ?? {}) as Record<string, unknown>;
  const per_page_options = (data.per_page_options ?? []) as number[];
  const selected_per_page = Number(data.selected_per_page ?? 1);

  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;

  return (
    <>
      <h1>Manage Trongate Administrators</h1>
      <Flashdata />
      <p>
        <a className="button alt" href={`${base}trongate_administrators/create`}>
          Create New Record
        </a>
      </p>
      {rows.length === 0 ? (
        <p>There are currently no records to display.</p>
      ) : (
        <>
          <Pagination data={pagination_data} />

          <table className="records-table">
            <thead>
              <tr>
                <th colSpan={4}>
                  <div>
                    <div>&nbsp;</div>
                    <div>
                      Records Per Page:{" "}
                      <PerPageSelect
                        options={per_page_options}
                        selected={selected_per_page}
                      />
                    </div>
                  </div>
                </th>
              </tr>
              <tr>
                <th>Username</th>
                <th>Trongate User ID</th>
                <th>Active</th>
                <th style={{ width: "20px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.username ?? "")}</td>
                  <td>{String(row.trongate_user_id ?? "")}</td>
                  <td>{String(row.active_formatted ?? "")}</td>
                  <td>
                    <a
                      className="button alt"
                      href={`${base}trongate_administrators/show/${row.id}`}
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length > 9 ? (
            <Pagination
              data={{ ...pagination_data, include_showing_statement: false }}
            />
          ) : null}
        </>
      )}
    </>
  );
}
