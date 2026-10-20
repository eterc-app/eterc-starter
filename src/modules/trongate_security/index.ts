import { registerSyncService } from "@/engine/controller";
import { TrongateSecurityService } from "./TrongateSecurityService";

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
registerSyncService("trongate_security", () => new TrongateSecurityService());

export { TrongateSecurityService };
export type { TrongateUserObj } from "@/engine/tokens";
