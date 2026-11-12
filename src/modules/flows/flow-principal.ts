import type { FlowPrincipal } from "./flow-types";

/** Principal used by webhooks, schedules and event hooks unless configured. */
export const SYSTEM_PRINCIPAL: FlowPrincipal = {
  kind: "system",
  user_id: null,
  role_id: null,
  role_name: "System",
  admin: true,
  email: null,
};

export function principal_from_cms(principal: {
  kind?: string;
  user_id?: number | null;
  role?: { id?: number; name?: string; admin_access?: boolean };
  email?: string | null;
  user_email?: string | null;
}): FlowPrincipal {
  return {
    kind:
      principal.kind === "user" || principal.kind === "api_key"
        ? principal.kind
        : "system",
    user_id: typeof principal.user_id === "number" ? principal.user_id : null,
    role_id: typeof principal.role?.id === "number" ? principal.role.id : null,
    role_name: principal.role?.name ?? "System",
    admin: principal.role?.admin_access === true,
    email: principal.email ?? principal.user_email ?? null,
  };
}
