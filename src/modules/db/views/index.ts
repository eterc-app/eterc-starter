import type { TgViewComponent } from "@/engine/views-registry";
import Browse from "./browse";
import DeleteConf from "./delete_conf";
import Forger from "./forger";
import NotFound from "./not_found";
import SqlConsole from "./sql_console";
import TableList from "./table_list";

/**
 * View registration map for the db (admin database tool) module — keys are
 * "{module}/{view_file}" and match the view files DbAdmin addresses via
 * `viewFile`.
 *
 * NOTE: the PHP original modules/db/Db.php is the framework ENGINE class and
 * ships no views; these view files were designed from the data contracts of
 * the ported DbAdmin controller (see each view's docblock).
 */
export const views: Record<string, TgViewComponent> = {
  "db/browse": Browse,
  "db/delete_conf": DeleteConf,
  "db/forger": Forger,
  "db/not_found": NotFound,
  "db/sql_console": SqlConsole,
  "db/table_list": TableList,
};
