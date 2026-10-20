import { siteUrl } from "@/engine/url";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * Evo home menu — port of evo/views/home.php.
 *
 * The original list items called MX to swap `main`; the port uses ordinary
 * links because each Evo page is rendered inside the admin theme.
 */
export default function EvoHome(_props: TgViewProps) {
  return (
    <div className="container">
      <h1>Flo</h1>
      <ul className="evo-menu">
        <li>
          <a href={siteUrl("trongate_control-evo/module_manager")}>
            Module Manager
          </a>
        </li>
        <li>
          <a href={siteUrl("trongate_control-query_builder/home")}>
            Query Builder
          </a>
        </li>
        <li>
          <a href={siteUrl("trongate_control-evo/ask")}>Ask a Question</a>
        </li>
      </ul>
    </div>
  );
}

export { EvoHome };
