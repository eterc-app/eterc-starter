import type { TgViewProps } from "@/engine/views-registry";
import { format_number } from "../format";

/**
 * pagination view — port of modules/pagination/views/pagination.php.
 *
 * This is the standalone list-style pagination view shipped alongside the
 * module (nav/ul markup). The canonical display() renderer used by other
 * modules lives in ../PaginationRenderer.tsx and matches Pagination.php's
 * own markup. Both views are registered so a caller addressing
 * "pagination/pagination" gets the same output as the PHP view.
 */
type PaginationLink = {
  type?: string;
  label?: string;
  url?: string;
  is_current?: boolean;
};

export default function PaginationView({ data }: TgViewProps) {
  const include_showing_statement = Boolean(data.include_showing_statement);
  const total_rows = Number(data.total_rows ?? 0);
  const current_page = Number(data.current_page ?? 1);
  const limit = Number(data.limit ?? 0);
  const total_pages = Number(data.total_pages ?? 0);
  const record_name_plural = String(data.record_name_plural ?? "records");
  const pagination_links = (data.pagination_links ?? []) as PaginationLink[];

  const showing_start = (current_page - 1) * limit + 1;
  const showing_end = Math.min(current_page * limit, total_rows);

  return (
    <>
      {include_showing_statement && total_rows > 0 ? (
        <p className="showing-statement">
          Showing {record_name_plural} {format_number(showing_start)} to{" "}
          {format_number(showing_end)} of {format_number(total_rows)}.
        </p>
      ) : null}

      {total_pages > 1 ? (
        <nav className="pagination">
          <ul className="pagination-list">
            {pagination_links.map((link, index) => {
              if (link.type === "ellipsis") {
                return (
                  <li key={index} className="pagination-ellipsis">
                    <span>{link.label}</span>
                  </li>
                );
              }

              if (link.type === "prev" || link.type === "next") {
                return (
                  <li
                    key={index}
                    className={`pagination-${link.type}`}
                  >
                    <a href={link.url}>{link.label}</a>
                  </li>
                );
              }

              return (
                <li key={index}>
                  <a
                    href={link.url}
                    className={
                      link.is_current
                        ? "pagination-link active"
                        : "pagination-link"
                    }
                  >
                    {link.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      <style>{`
.showing-statement {
    margin-bottom: 1em;
    color: #666;
}

.pagination {
    margin: 2em 0;
}

.pagination-list {
    display: flex;
    list-style: none;
    padding: 0;
    margin: 0;
    gap: 0.25em;
}

.pagination-list li {
    display: inline-block;
}

.pagination-link,
.pagination-prev a,
.pagination-next a {
    display: block;
    padding: 0.5em 0.75em;
    border: 1px solid #ddd;
    background-color: #fff;
    color: #333;
    text-decoration: none;
    transition: all 0.2s;
}

.pagination-link:hover,
.pagination-prev a:hover,
.pagination-next a:hover {
    background-color: #f5f5f5;
    border-color: #999;
}

.pagination-link.active {
    background-color: var(--primary, #007bff);
    color: #fff;
    border-color: var(--primary, #007bff);
    pointer-events: none;
}

.pagination-ellipsis span {
    display: block;
    padding: 0.5em 0.75em;
    color: #999;
}
      `}</style>
    </>
  );
}
