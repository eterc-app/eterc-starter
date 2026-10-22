import { register_sync_service } from "@/engine/controller";
import { Eterc_security } from "./Eterc_security";

/**
 * eterc_security module entry.
 *
 * Registers the security service with the controller proxy so framework
 * controllers can use `this.eterc_security` exactly like in the PHP
 * original (e.g. `this.eterc_security.make_sure_allowed()`).
 *
 * Importing this file is side-effectful (it registers the factory) but safe:
 * no request context is touched and no connections are opened — the factory
 * only runs lazily on first property access via the controller proxy.
 */
register_sync_service("eterc_security", () => new Eterc_security());

export { Eterc_security };
export type { EtercUserObj } from "@/engine/Eterc_tokens";
