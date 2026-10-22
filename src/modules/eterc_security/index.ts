import { register_sync_service } from "@/engine/controller";
import { Eterc_security } from "./Eterc_security";
register_sync_service("eterc_security", () => new Eterc_security());

export { Eterc_security };
export type { EtercUserObj } from "@/engine/Eterc_tokens";
