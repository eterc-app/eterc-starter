import type { EtViewProps } from "@/engine/views-registry";
import { format_number } from "../format";

/**
 * pagination view — port of modules/pagination/views/pagination.php.
 *
 * The standalone list-style pagination view. The canonical renderer used by
 * other modules lives in ../PaginationRenderer.tsx.
 */
type PaginationLink = {
  type?: string;
  label?: string;
  url?: string;
  is_current?: boolean;
};

export default function PaginationView({ data }: EtViewProps) {
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
        <p className="mb-4 text-sm text-muted-foreground">
          Showing {record_name_plural} {format_number(showing_start)} to{" "}
          {format_number(showing_end)} of {format_number(total_rows)}.
        </p>
      ) : null}

      {total_pages > 1 ? (
        <nav className="my-8" aria-label="Pagination">
          <ul className="flex list-none flex-wrap gap-1 p-0">
            {pagination_links.map((link, index) => {
              if (link.type === "ellipsis") {
                return (
                  <li key={index}>
                    <span className="block px-3 py-2 text-muted-foreground">
                      {link.label}
                    </span>
                  </li>
                );
              }

              if (link.type === "prev" || link.type === "next") {
                return (
                  <li key={index}>
                    <a
                      href={link.url}
                      className="block rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                    >
                      {link.label}
                    </a>
                  </li>
                );
              }

              return (
                <li key={index}>
                  <a
                    href={link.url}
                    aria-current={link.is_current ? "page" : undefined}
                    className={
                      link.is_current
                        ? "pointer-events-none block rounded-md border border-primary bg-primary px-3 py-2 text-sm text-primary-foreground"
                        : "block rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
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
    </>
  );
}
