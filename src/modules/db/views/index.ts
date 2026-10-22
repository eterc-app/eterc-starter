import type { EtViewComponent } from "@/engine/views-registry";
import Browse from "./browse";
import DeleteConf from "./delete_conf";
import Forger from "./forger";
import NotFound from "./not_found";
import SqlConsole from "./sql_console";
import TableList from "./table_list";
export const views: Record<string, EtViewComponent> = {
  "db/browse": Browse,
  "db/delete_conf": DeleteConf,
  "db/forger": Forger,
  "db/not_found": NotFound,
  "db/sql_console": SqlConsole,
  "db/table_list": TableList,
};
