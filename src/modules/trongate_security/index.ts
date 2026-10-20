import { register_sync_service } from "@/engine/controller";
import { Trongate_security } from "./Trongate_security";

/**
 * trongate_security module entry.
 *
 * Registers the security service with the controller proxy so framework
 * controllers can use `this.trongate_security` exactly like in the PHP
 * original (e.g. `this.trongate_security.make_sure_allowed()`).
 *
 * Importing this file is side-effectful (it registers the factory) but safe:
 * no request context is touched and no connections are opened — the factory
 * only runs lazily on first property access via the controller proxy.
 */
register_sync_service("trongate_security", () => new Trongate_security());

export { Trongate_security };
export type { TrongateUserObj } from "@/engine/Trongate_tokens";
