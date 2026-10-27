"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  CornerDownRight,
  Database,
  GitBranch,
  KeyRound,
  PanelLeft,
  Pencil,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { Notice } from "@/components/app/Notice";
import { PageActions } from "@/components/app/PageActions";
import { SectionDrawer, SideDrawer } from "@/components/app/SideDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EtViewProps } from "@/engine/views-registry";
import type {
  CmsApiKey,
  CmsApiKeyWithSecret,
  CmsPermission,
  CmsPermissionAction,
  CmsPermissionInput,
  CmsRole,
  CmsUserSummary,
} from "@/modules/cms/cms-types";
import {
  ACTION_LABELS,
  RuleSheet,
  draft_from_permission,
  empty_draft,
  has_advanced_rules,
  permission_input_from_draft,
  type AccessCollection,
  type PermissionDraft,
} from "./access/RuleSheet";
import {
  BusyButton,
  CopyButton,
  EmptyState,
  PageHeader,
  cms_call,
  format_datetime,
  format_relative,
} from "./ui";

interface Overview {
  roles: Array<CmsRole & { user_count: number }>;
  users: CmsUserSummary[];
  api_keys: CmsApiKey[];
  permissions: Record<number, CmsPermission[]>;
  collections: AccessCollection[];
}

interface AccessState {
  overview: Overview;
}

interface RoleForm {
  id: number;
  name: string;
  description: string;
  app_access: boolean;
  api_access: boolean;
  admin_access: boolean;
  parent_role_id: string;
}

interface KeyForm {
  name: string;
  role_id: string;
  user_id: string;
  expires_at: string;
}

const ACTIONS: Array<{ key: CmsPermissionAction; label: string }> = [
  { key: "read", label: "Read" },
  { key: "create", label: "Create" },
  { key: "update", label: "Update" },
  { key: "delete", label: "Delete" },
];

type AccessSection = "roles" | "users" | "keys";

function emptyRole(): RoleForm {
  return {
    id: 0,
    name: "",
    description: "",
    app_access: true,
    api_access: true,
    admin_access: false,
    parent_role_id: "",
  };
}

function emptyKey(): KeyForm {
  return { name: "", role_id: "", user_id: "none", expires_at: "" };
}

function roleBadges(role: CmsRole) {
  return (
    <>
      {role.is_system ? <Badge variant="outline">System</Badge> : null}
      {role.admin_access ? <Badge>Admin area</Badge> : null}
      {role.app_access ? (
        <Badge variant="secondary">App</Badge>
      ) : (
        <Badge variant="outline">No app</Badge>
      )}
      {role.api_access ? (
        <Badge variant="secondary">API</Badge>
      ) : (
        <Badge variant="outline">No API</Badge>
      )}
    </>
  );
}

function permission_key(collection: string, action: CmsPermissionAction): string {
  return `${collection}:${action}`;
}

function direct_permission(
  permissions: CmsPermission[],
  collection: string,
  action: CmsPermissionAction
): CmsPermission | null {
  return (
    permissions.find(
      (permission) =>
        permission.collection === collection && permission.action === action
    ) ?? null
  );
}

function effective_permission(
  roles: CmsRole[],
  permissions: Record<number, CmsPermission[]>,
  roleId: number,
  collection: string,
  action: CmsPermissionAction
): { permission: CmsPermission; source: CmsRole; inherited: boolean } | null {
  let current = roles.find((role) => role.id === roleId) ?? null;
  const seen = new Set<number>();
  while (current) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    const list = permissions[current.id] ?? [];
    const permission =
      direct_permission(list, collection, action) ??
      direct_permission(list, "*", action);
    if (permission) {
      return {
        permission,
        source: current,
        inherited: current.id !== roleId,
      };
    }
    current = current.parent_role_id
      ? roles.find((role) => role.id === current?.parent_role_id) ?? null
      : null;
  }
  return null;
}

function descendant_role_ids(roles: CmsRole[], roleId: number): Set<number> {
  const descendants = new Set<number>();
  if (roleId <= 0) return descendants;
  const queue = [roleId];
  while (queue.length > 0) {
    const parent = queue.shift() as number;
    for (const role of roles) {
      if (role.parent_role_id === parent && !descendants.has(role.id)) {
        descendants.add(role.id);
        queue.push(role.id);
      }
    }
  }
  return descendants;
}

export default function AccessStudio({ data }: EtViewProps) {
  const initial = data.overview as Overview;
  const [overview, setOverview] = useState<Overview>(initial);
  const [section, setSection] = useState<AccessSection>("roles");
  const [sectionDrawerOpen, setSectionDrawerOpen] = useState(false);
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const { confirm, dialog: confirm_dialog } = useConfirm();

  const [roleOpen, setRoleOpen] = useState(false);
  const [roleForm, setRoleForm] = useState<RoleForm>(emptyRole());
  const [roleSaving, setRoleSaving] = useState(false);

  const firstEditable =
    initial.roles.find((role) => !role.is_system) ?? initial.roles[0];
  const [selectedRoleId, setSelectedRoleId] = useState<number>(
    firstEditable?.id ?? 0
  );

  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<PermissionDraft | null>(null);
  const [ruleSaving, setRuleSaving] = useState(false);

  const [keyOpen, setKeyOpen] = useState(false);
  const [keyForm, setKeyForm] = useState<KeyForm>(emptyKey());
  const [keySaving, setKeySaving] = useState(false);
  const [createdKey, setCreatedKey] = useState<CmsApiKeyWithSecret | null>(null);

  const selectedRole = useMemo(
    () => overview.roles.find((role) => role.id === selectedRoleId) ?? null,
    [overview.roles, selectedRoleId]
  );
  const selectedPermissions = useMemo(
    () => overview.permissions[selectedRoleId] ?? [],
    [overview.permissions, selectedRoleId]
  );
  const parentRole = useMemo(
    () =>
      selectedRole?.parent_role_id
        ? overview.roles.find((role) => role.id === selectedRole.parent_role_id) ??
          null
        : null,
    [overview.roles, selectedRole]
  );
  const selectedCollection = useMemo(
    () =>
      ruleDraft
        ? overview.collections.find(
            (collection) => collection.name === ruleDraft.collection
          ) ?? null
        : null,
    [overview.collections, ruleDraft]
  );
  const apiRoles = overview.roles.filter((role) => role.api_access);
  const keyUsers = overview.users.filter((user) => user.eterc_user_id !== null);

  const refresh = useCallback(async () => {
    try {
      const state = await cms_call<AccessState>("access_state");
      setOverview(state.overview);
      const nextRole =
        state.overview.roles.find((role) => role.id === selectedRoleId) ??
        state.overview.roles.find((role) => !role.is_system) ??
        state.overview.roles[0];
      if (nextRole) setSelectedRoleId(nextRole.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not refresh access settings."
      );
    }
  }, [selectedRoleId]);

  const selectRole = useCallback((role: CmsRole) => {
    setSelectedRoleId(role.id);
  }, []);

  const openCreateRole = useCallback(() => {
    setRoleForm(emptyRole());
    setRoleOpen(true);
  }, []);

  const openEditRole = useCallback((role: CmsRole) => {
    setRoleForm({
      id: role.id,
      name: role.name,
      description: role.description,
      app_access: role.app_access,
      api_access: role.api_access,
      admin_access: role.admin_access,
      parent_role_id: role.parent_role_id ? String(role.parent_role_id) : "",
    });
    setRoleOpen(true);
  }, []);

  const parentOptions = useMemo(() => {
    const blocked = descendant_role_ids(overview.roles, roleForm.id);
    return overview.roles.filter(
      (role) => role.id !== roleForm.id && !blocked.has(role.id)
    );
  }, [overview.roles, roleForm.id]);

  const saveRole = useCallback(async () => {
    setRoleSaving(true);
    try {
      await cms_call("access_role_save", {
        id: roleForm.id || undefined,
        name: roleForm.name,
        description: roleForm.description,
        app_access: roleForm.app_access,
        api_access: roleForm.api_access,
        admin_access: roleForm.admin_access,
        parent_role_id: roleForm.parent_role_id
          ? Number(roleForm.parent_role_id)
          : null,
      });
      toast.success(roleForm.id ? "Role updated." : "Role created.");
      setRoleOpen(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the role.");
    } finally {
      setRoleSaving(false);
    }
  }, [refresh, roleForm]);

  const deleteRole = useCallback(
    async (role: CmsRole) => {
      const confirmed = await confirm({
        title: "Delete role?",
        description: (
          <>
            The role{" "}
            <span className="font-mono text-foreground">{role.name}</span> will
            be permanently removed. Users and child roles must be moved first.
            This cannot be undone.
          </>
        ),
        confirmLabel: "Delete role",
      });
      if (!confirmed) return;
      try {
        await cms_call("access_role_delete", { id: role.id });
        toast.success("Role deleted.");
        await refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not delete the role."
        );
      }
    },
    [confirm, refresh]
  );

  const openRule = useCallback(
    (collection: AccessCollection, action: CmsPermissionAction) => {
      if (!selectedRole || selectedRole.is_system) return;
      const direct = direct_permission(selectedPermissions, collection.name, action);
      if (direct) {
        setRuleDraft(draft_from_permission(direct, { existing: true }));
        setRuleOpen(true);
        return;
      }
      const effective = effective_permission(
        overview.roles,
        overview.permissions,
        selectedRole.id,
        collection.name,
        action
      );
      if (effective) {
        const wildcard = effective.permission.collection === "*";
        const inheritedFrom = wildcard
          ? "All collections"
          : effective.source.name;
        const permission = wildcard
          ? { ...effective.permission, collection: collection.name }
          : effective.permission;
        setRuleDraft(
          draft_from_permission(permission, {
            existing: false,
            inheritedFrom,
            readOnly: true,
          })
        );
        setRuleOpen(true);
        return;
      }
      setRuleDraft(empty_draft(collection.name, action));
      setRuleOpen(true);
    },
    [overview.permissions, overview.roles, selectedPermissions, selectedRole]
  );

  const saveRule = useCallback(
    async (draft: PermissionDraft) => {
      if (!selectedRole || selectedRole.is_system || draft.readOnly) return;
      if (!draft.allow) {
        const confirmed = await confirm({
          title: "Remove policy?",
          description: (
            <>
              The {ACTION_LABELS[draft.action].toLowerCase()} policy for{" "}
              <span className="font-mono text-foreground">{draft.collection}</span>{" "}
              will be removed from{" "}
              <span className="font-semibold">{selectedRole.name}</span>. Access
              may still be inherited from a parent role. This cannot be undone.
            </>
          ),
          confirmLabel: "Remove policy",
        });
        if (!confirmed) return;
      }

      setRuleSaving(true);
      try {
        const map = new Map<string, CmsPermissionInput>();
        for (const permission of selectedPermissions) {
          map.set(permission_key(permission.collection, permission.action), {
            collection: permission.collection,
            action: permission.action,
            fields: permission.fields,
            filter: permission.filter,
            validation: permission.validation,
            presets: permission.presets,
          });
        }
        const key = permission_key(draft.collection, draft.action);
        if (draft.allow) {
          map.set(key, permission_input_from_draft(draft));
        } else {
          map.delete(key);
        }
        await cms_call("access_permissions_save", {
          role_id: selectedRole.id,
          permissions: [...map.values()],
        });
        toast.success(
          draft.allow
            ? `Policy saved for ${selectedRole.name}.`
            : `Policy removed from ${selectedRole.name}.`
        );
        setRuleOpen(false);
        await refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not save the policy."
        );
      } finally {
        setRuleSaving(false);
      }
    },
    [confirm, refresh, selectedPermissions, selectedRole]
  );

  const changeUserRole = useCallback(
    async (user: CmsUserSummary, roleId: string) => {
      try {
        await cms_call("access_user_role", {
          user_id: user.id,
          role_id: Number(roleId),
        });
        toast.success("User role updated.");
        await refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not update the user role."
        );
      }
    },
    [refresh]
  );

  const openCreateKey = useCallback(() => {
    const defaultRole =
      overview.roles.find((role) => role.api_access && !role.is_system) ??
      overview.roles.find((role) => role.api_access);
    setKeyForm({
      ...emptyKey(),
      role_id: defaultRole ? String(defaultRole.id) : "",
    });
    setKeyOpen(true);
  }, [overview.roles]);

  const saveKey = useCallback(async () => {
    setKeySaving(true);
    try {
      const created = await cms_call<CmsApiKeyWithSecret>("access_key_create", {
        name: keyForm.name,
        role_id: Number(keyForm.role_id),
        user_id: keyForm.user_id === "none" ? null : Number(keyForm.user_id),
        expires_at: keyForm.expires_at || null,
      });
      setCreatedKey(created);
      setKeyOpen(false);
      toast.success("API key created. Copy it now; it will not be shown again.");
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create the API key."
      );
    } finally {
      setKeySaving(false);
    }
  }, [keyForm, refresh]);

  const revokeKey = useCallback(
    async (key: CmsApiKey) => {
      const confirmed = await confirm({
        title: "Revoke API key?",
        description: (
          <>
            The key{" "}
            <span className="font-mono text-foreground">{key.name}</span> will
            stop working immediately. Existing clients will receive
            authentication errors.
          </>
        ),
        confirmLabel: "Revoke key",
      });
      if (!confirmed) return;
      try {
        await cms_call("access_key_revoke", { id: key.id });
        toast.success("API key revoked.");
        await refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not revoke the API key."
        );
      }
    },
    [confirm, refresh]
  );

  const deleteKey = useCallback(
    async (key: CmsApiKey) => {
      const confirmed = await confirm({
        title: "Delete API key?",
        description: (
          <>
            The key{" "}
            <span className="font-mono text-foreground">{key.name}</span> will
            be permanently removed. This cannot be undone.
          </>
        ),
        confirmLabel: "Delete key",
      });
      if (!confirmed) return;
      try {
        await cms_call("access_key_delete", { id: key.id });
        toast.success("API key deleted.");
        await refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not delete the API key."
        );
      }
    },
    [confirm, refresh]
  );

  const roleIsSystem = roleForm.id > 0 && selectedRole?.is_system === true;

  const renderRoleButtons = (close?: () => void) =>
    overview.roles.map((role) => {
      const parent = role.parent_role_id
        ? overview.roles.find(
            (candidate) => candidate.id === role.parent_role_id
          )
        : null;
      return (
        <button
          key={role.id}
          type="button"
          onClick={() => {
            selectRole(role);
            close?.();
          }}
          className={cn(
            "w-full rounded-lg border p-3 text-left transition-colors",
            role.id === selectedRoleId
              ? "border-foreground/30 bg-muted"
              : "border-border hover:bg-surface-subtle"
          )}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold">{role.name}</span>
            <span className="text-xs text-muted-foreground">
              {role.user_count} user{role.user_count === 1 ? "" : "s"}
            </span>
          </span>
          <span className="mt-2 flex flex-wrap gap-1">{roleBadges(role)}</span>
          {parent ? (
            <span className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <GitBranch className="size-3" />
              Inherits {parent.name}
            </span>
          ) : null}
        </button>
      );
    });

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="System"
        title="Access control"
        description="Roles, row-level policies, field access, and scoped API credentials."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Access sections"
              title="Access sections"
              onClick={() => setSectionDrawerOpen(true)}
            >
              <PanelLeft className="size-4" />
            </Button>
            <PageActions
              items={[
                {
                  label: "New role",
                  icon: <Plus className="size-4" />,
                  variant: "default",
                  onSelect: openCreateRole,
                },
              ]}
            />
          </>
        }
      />

      <SectionDrawer
        open={sectionDrawerOpen}
        onOpenChange={setSectionDrawerOpen}
        title="Access sections"
        description="Switch between roles, people, and API credentials."
        value={section}
        onSelect={(value) => {
          setSection(value as AccessSection);
          setSectionDrawerOpen(false);
        }}
        items={[
          {
            value: "roles",
            label: "Roles",
            description: "Policies, inheritance, and field access.",
            icon: <ShieldCheck className="size-4" />,
            badge: <Badge variant="outline">{overview.roles.length}</Badge>,
          },
          {
            value: "users",
            label: "Users",
            description: "Assign people to a role.",
            icon: <Users className="size-4" />,
            badge: <Badge variant="outline">{overview.users.length}</Badge>,
          },
          {
            value: "keys",
            label: "API keys",
            description: "Scoped credentials and user binding.",
            icon: <KeyRound className="size-4" />,
            badge: <Badge variant="outline">{overview.api_keys.length}</Badge>,
          },
        ]}
      />

      <SideDrawer
        open={roleDrawerOpen}
        onOpenChange={setRoleDrawerOpen}
        title="Roles"
        description="Choose the role whose policies you want to manage."
      >
        <div className="space-y-2">
          {renderRoleButtons(() => setRoleDrawerOpen(false))}
        </div>
      </SideDrawer>

      {section === "roles" ? (
        <div className="grid gap-6">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b border-border">
                <div className="min-w-0">
                  <CardTitle>
                    {selectedRole ? selectedRole.name : "Select a role"}
                  </CardTitle>
                  {selectedRole?.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedRole.description}
                    </p>
                  ) : null}
                  {selectedRole ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {roleBadges(selectedRole)}
                    </div>
                  ) : null}
                </div>
                {selectedRole ? (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Browse roles"
                      title="Browse roles"
                      onClick={() => setRoleDrawerOpen(true)}
                    >
                      <Users className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Edit role"
                      title="Edit role"
                      onClick={() => openEditRole(selectedRole)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    {!selectedRole.is_system ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete role"
                        onClick={() => deleteRole(selectedRole)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardHeader>
              <CardContent>
                {!selectedRole ? (
                  <EmptyState
                    icon={<ShieldCheck className="size-5" />}
                    title="No role selected"
                    action={<Button onClick={openCreateRole}>New role</Button>}
                  />
                ) : selectedRole.is_system ? (
                  <Notice icon={ShieldCheck}>
                    Full access. The Administrator role bypasses every collection
                    policy, including row filters and field restrictions.
                  </Notice>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-border bg-surface-subtle p-3">
                        <p className="type-headline">Parent role</p>
                        <p className="mt-1 text-sm font-medium">
                          {parentRole?.name ?? "None"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-surface-subtle p-3">
                        <p className="type-headline">Direct policies</p>
                        <p className="mt-1 text-sm font-medium">
                          {selectedPermissions.length}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-surface-subtle p-3">
                        <p className="type-headline">Users</p>
                        <p className="mt-1 text-sm font-medium">
                          {selectedRole.user_count}
                        </p>
                      </div>
                    </div>

                    {parentRole ? (
                      <Notice icon={GitBranch}>
                        Actions without a direct policy inherit from{" "}
                        <span className="font-semibold">{parentRole.name}</span>.
                        A direct policy overrides the parent for that action.
                      </Notice>
                    ) : null}

                    {overview.collections.length === 0 ? (
                      <EmptyState
                        icon={<Database className="size-5" />}
                        title="No collections yet"
                        action={
                          <Button asChild variant="outline">
                            <Link href="/admin/data">Open Data Studio</Link>
                          </Button>
                        }
                      />
                    ) : (
                      <>
                        <div className="app-scrollbar overflow-x-auto rounded-lg border border-border">
                          <table className="w-full min-w-[640px] text-sm">
                            <thead>
                              <tr className="border-b border-border bg-surface-subtle text-left">
                                <th className="h-11 px-3 text-xs font-semibold text-muted-foreground">
                                  Collection
                                </th>
                                {ACTIONS.map((action) => (
                                  <th
                                    key={action.key}
                                    className="h-11 px-3 text-center text-xs font-semibold text-muted-foreground"
                                  >
                                    {action.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {overview.collections.map((collection) => (
                                <tr
                                  key={collection.name}
                                  className="border-b border-border last:border-b-0"
                                >
                                  <td className="px-3 py-3">
                                    <span className="font-semibold">
                                      {collection.label}
                                    </span>
                                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                                      {collection.name}
                                    </span>
                                  </td>
                                  {ACTIONS.map((action) => {
                                    const direct = direct_permission(
                                      selectedPermissions,
                                      collection.name,
                                      action.key
                                    );
                                    const effective = effective_permission(
                                      overview.roles,
                                      overview.permissions,
                                      selectedRole.id,
                                      collection.name,
                                      action.key
                                    );
                                    const inherited = effective
                                      ? !direct
                                      : false;
                                    const title = effective
                                      ? inherited
                                        ? `Inherited from ${
                                            effective.permission.collection === "*"
                                              ? "All collections"
                                              : effective.source.name
                                          }`
                                        : has_advanced_rules(effective.permission)
                                          ? "Direct policy with rules"
                                          : "Direct policy"
                                      : "No policy. Click to configure.";
                                    return (
                                      <td
                                        key={action.key}
                                        className="px-3 py-3 text-center"
                                      >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openRule(collection, action.key)
                                          }
                                          title={title}
                                          aria-label={`${
                                            effective ? "Edit" : "Add"
                                          } ${ACTION_LABELS[action.key]} policy for ${
                                            collection.label
                                          }`}
                                          className={cn(
                                            "mx-auto flex h-9 min-w-9 items-center justify-center gap-1 rounded-md border px-2 transition-colors",
                                            effective
                                              ? inherited
                                                ? "border-dashed border-border bg-card text-muted-foreground hover:bg-muted"
                                                : "border-primary bg-primary text-primary-foreground hover:bg-primary/85"
                                              : "border-input bg-card text-muted-foreground hover:bg-muted"
                                          )}
                                        >
                                          {effective ? (
                                            <Check className="size-4" />
                                          ) : (
                                            <span className="size-2 rounded-full bg-border" />
                                          )}
                                          {effective &&
                                          has_advanced_rules(effective.permission) ? (
                                            <SlidersHorizontal className="size-3" />
                                          ) : null}
                                          {inherited ? (
                                            <CornerDownRight className="size-3" />
                                          ) : null}
                                        </button>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="type-note">
                          Click an action to edit row rules, field access,
                          validation, and presets. Inherited actions use a dashed
                          indicator.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
        </div>
      ) : null}

      {section === "users" ? (
          <Card>
            <CardHeader className="border-b border-border">
              <CardTitle>Users and roles</CardTitle>
            </CardHeader>
            <CardContent>
              {overview.users.length === 0 ? (
                <EmptyState
                  icon={<Users className="size-5" />}
                  title="No users yet"
                  action={
                    <Button asChild>
                      <Link href="/administrators/manage">Manage users</Link>
                    </Button>
                  }
                />
              ) : (
                <div className="app-scrollbar overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-subtle text-left">
                        <th className="h-11 px-3 text-xs font-semibold text-muted-foreground">
                          User
                        </th>
                        <th className="h-11 px-3 text-xs font-semibold text-muted-foreground">
                          Email
                        </th>
                        <th className="h-11 px-3 text-xs font-semibold text-muted-foreground">
                          Role
                        </th>
                        <th className="h-11 px-3 text-xs font-semibold text-muted-foreground">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.users.map((user) => (
                        <tr
                          key={user.id}
                          className="border-b border-border last:border-b-0"
                        >
                          <td className="px-3 py-3 font-semibold">
                            {user.username || `#${user.id}`}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {user.email || "—"}
                          </td>
                          <td className="px-3 py-3">
                            <Select
                              value={user.role_id ? String(user.role_id) : ""}
                              onValueChange={(value) =>
                                changeUserRole(user, value)
                              }
                            >
                              <SelectTrigger className="w-[190px]" size="sm">
                                <SelectValue placeholder="Unassigned" />
                              </SelectTrigger>
                              <SelectContent>
                                {overview.roles.map((role) => (
                                  <SelectItem
                                    key={role.id}
                                    value={String(role.id)}
                                  >
                                    {role.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-3">
                            <Badge
                              variant={user.active ? "success" : "outline"}
                            >
                              {user.active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
      ) : null}

      {section === "keys" ? (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b border-border">
              <div>
                <CardTitle>API keys</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keys inherit a role. Bind a user to evaluate{" "}
                  <span className="font-mono text-xs">$user</span> rules.
                </p>
              </div>
              <Button onClick={openCreateKey}>
                <Plus className="size-4" />
                Create API key
              </Button>
            </CardHeader>
            <CardContent>
              {overview.api_keys.length === 0 ? (
                <EmptyState
                  icon={<KeyRound className="size-5" />}
                  title="No API keys yet"
                  action={<Button onClick={openCreateKey}>Create API key</Button>}
                />
              ) : (
                <div className="app-scrollbar overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-subtle text-left">
                        <th className="h-11 px-3 text-xs font-semibold text-muted-foreground">
                          Name
                        </th>
                        <th className="h-11 px-3 text-xs font-semibold text-muted-foreground">
                          Key
                        </th>
                        <th className="h-11 px-3 text-xs font-semibold text-muted-foreground">
                          Role
                        </th>
                        <th className="h-11 px-3 text-xs font-semibold text-muted-foreground">
                          Acts as
                        </th>
                        <th className="h-11 px-3 text-xs font-semibold text-muted-foreground">
                          Last used
                        </th>
                        <th className="h-11 px-3 text-xs font-semibold text-muted-foreground">
                          Expires
                        </th>
                        <th className="h-11 px-3 text-xs font-semibold text-muted-foreground">
                          Status
                        </th>
                        <th className="h-11 px-3 text-right text-xs font-semibold text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.api_keys.map((key) => (
                        <tr
                          key={key.id}
                          className="border-b border-border last:border-b-0"
                        >
                          <td className="px-3 py-3 font-semibold">{key.name}</td>
                          <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                            etk_{key.key_prefix}_…
                          </td>
                          <td className="px-3 py-3">
                            {key.role_name || `#${key.role_id}`}
                          </td>
                          <td className="px-3 py-3">
                            {key.user_id ? (
                              <span className="block">
                                <span className="block font-medium">
                                  {key.user_name || `#${key.user_id}`}
                                </span>
                                {key.user_email ? (
                                  <span className="block text-xs text-muted-foreground">
                                    {key.user_email}
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <Badge variant="outline">Service key</Badge>
                            )}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {format_relative(key.last_used_at)}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {key.expires_at
                              ? format_datetime(
                                  new Date(key.expires_at * 1000).toISOString()
                                )
                              : "Never"}
                          </td>
                          <td className="px-3 py-3">
                            <Badge
                              variant={key.active ? "success" : "outline"}
                            >
                              {key.active ? "Active" : "Revoked"}
                            </Badge>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-1">
                              {key.active ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => revokeKey(key)}
                                >
                                  Revoke
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteKey(key)}
                                >
                                  <Trash2 className="size-3.5" />
                                  Delete
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
      ) : null}

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{roleForm.id ? "Edit role" : "New role"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                value={roleForm.name}
                placeholder="Editor"
                disabled={roleIsSystem}
                onChange={(event) =>
                  setRoleForm((form) => ({ ...form, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="role-description">Description</Label>
              <Input
                id="role-description"
                value={roleForm.description}
                placeholder="Can edit posts but cannot manage access."
                disabled={roleIsSystem}
                onChange={(event) =>
                  setRoleForm((form) => ({
                    ...form,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-3">
              <Label>Parent role</Label>
              <Select
                value={roleForm.parent_role_id || "none"}
                onValueChange={(value) =>
                  setRoleForm((form) => ({
                    ...form,
                    parent_role_id: value === "none" ? "" : value,
                  }))
                }
                disabled={roleIsSystem}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No parent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No parent</SelectItem>
                  {parentOptions.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="type-note">
                Actions without a direct policy inherit from the parent role.
              </p>
            </div>
            <div className="space-y-3 rounded-lg border border-border p-4">
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={roleForm.app_access}
                  onCheckedChange={(checked) =>
                    setRoleForm((form) => ({
                      ...form,
                      app_access: checked === true,
                    }))
                  }
                  disabled={roleIsSystem}
                />
                <span>
                  <span className="block font-medium">App access</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Use the application interface.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={roleForm.api_access}
                  onCheckedChange={(checked) =>
                    setRoleForm((form) => ({
                      ...form,
                      api_access: checked === true,
                    }))
                  }
                  disabled={roleIsSystem}
                />
                <span>
                  <span className="block font-medium">API access</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Authenticate API requests and API keys.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={roleForm.admin_access}
                  onCheckedChange={(checked) =>
                    setRoleForm((form) => ({
                      ...form,
                      admin_access: checked === true,
                    }))
                  }
                  disabled={roleIsSystem}
                />
                <span>
                  <span className="block font-medium">Admin area</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Manage schema, users, and access. Bypasses collection policies.
                  </span>
                </span>
              </label>
            </div>
            {roleIsSystem ? (
              <Notice icon={ShieldCheck}>
                The Administrator role always has app, API, and admin access.
              </Notice>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRoleOpen(false)}
            >
              Cancel
            </Button>
            <BusyButton
              type="button"
              busy={roleSaving}
              onClick={saveRole}
              disabled={!roleForm.name.trim()}
            >
              {roleForm.id ? "Save role" : "Create role"}
            </BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={keyForm.name}
                placeholder="Production integration"
                onChange={(event) =>
                  setKeyForm((form) => ({ ...form, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-3">
              <Label>Role</Label>
              <Select
                value={keyForm.role_id}
                onValueChange={(value) =>
                  setKeyForm((form) => ({ ...form, role_id: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {apiRoles.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {apiRoles.length === 0 ? (
                <p className="text-xs text-destructive">
                  Enable API access on a role before creating a key.
                </p>
              ) : null}
            </div>
            <div className="space-y-3">
              <Label>Acts as</Label>
              <Select
                value={keyForm.user_id}
                onValueChange={(value) =>
                  setKeyForm((form) => ({ ...form, user_id: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Service key" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Service key (no user)</SelectItem>
                  {keyUsers.map((user) => (
                    <SelectItem
                      key={user.eterc_user_id}
                      value={String(user.eterc_user_id)}
                    >
                      {user.username || `#${user.id}`}
                      {user.email ? ` · ${user.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="type-note">
                Bind a user when policies use{" "}
                <span className="font-mono text-xs">$user.id</span> or{" "}
                <span className="font-mono text-xs">$user.email</span>.
              </p>
            </div>
            <div className="space-y-3">
              <Label htmlFor="key-expiry">Expires</Label>
              <Input
                id="key-expiry"
                type="date"
                value={keyForm.expires_at}
                onChange={(event) =>
                  setKeyForm((form) => ({
                    ...form,
                    expires_at: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setKeyOpen(false)}
            >
              Cancel
            </Button>
            <BusyButton
              type="button"
              busy={keySaving}
              onClick={saveKey}
              disabled={!keyForm.name.trim() || !keyForm.role_id}
            >
              Create key
            </BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createdKey !== null}
        onOpenChange={(open) => !open && setCreatedKey(null)}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
          </DialogHeader>
          {createdKey ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-surface-subtle p-4">
                <p className="break-all font-mono text-xs">{createdKey.secret}</p>
              </div>
              <div className="flex gap-2">
                <CopyButton value={createdKey.secret} label="Copy key" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreatedKey(null);
                    setSection("keys");
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {ruleOpen && ruleDraft && selectedCollection ? (
        <RuleSheet
          key={`${ruleDraft.collection}:${ruleDraft.action}:${ruleDraft.readOnly}`}
          open={ruleOpen}
          onOpenChange={setRuleOpen}
          initialDraft={ruleDraft}
          collection={selectedCollection}
          roleName={selectedRole?.name ?? "Role"}
          saving={ruleSaving}
          onSave={saveRule}
        />
      ) : null}

      {confirm_dialog}
    </div>
  );
}
