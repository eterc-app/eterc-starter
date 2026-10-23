"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  KeyRound,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EtViewProps } from "@/engine/views-registry";
import type {
  CmsApiKey,
  CmsApiKeyWithSecret,
  CmsPermission,
  CmsPermissionAction,
  CmsRole,
  CmsRuntimeConfig,
  CmsUserSummary,
} from "@/modules/cms/cms-types";
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
  collections: Array<{ name: string; label: string }>;
}

interface AccessState {
  overview: Overview;
  runtime: CmsRuntimeConfig;
}

interface RoleForm {
  id: number;
  name: string;
  description: string;
  app_access: boolean;
  api_access: boolean;
  admin_access: boolean;
}

interface KeyForm {
  name: string;
  role_id: string;
  expires_at: string;
}

const ACTIONS: Array<{ key: CmsPermissionAction; label: string }> = [
  { key: "read", label: "Read" },
  { key: "create", label: "Create" },
  { key: "update", label: "Update" },
  { key: "delete", label: "Delete" },
];

function emptyRole(): RoleForm {
  return {
    id: 0,
    name: "",
    description: "",
    app_access: true,
    api_access: true,
    admin_access: false,
  };
}

function emptyKey(): KeyForm {
  return { name: "", role_id: "", expires_at: "" };
}

function matrix_from_permissions(permissions: CmsPermission[]): Record<string, Record<CmsPermissionAction, boolean>> {
  const matrix: Record<string, Record<CmsPermissionAction, boolean>> = {};
  for (const permission of permissions) {
    matrix[permission.collection] ??= {
      read: false,
      create: false,
      update: false,
      delete: false,
    };
    matrix[permission.collection][permission.action] = true;
  }
  return matrix;
}

function roleBadges(role: CmsRole) {
  return (
    <>
      {role.is_system ? <Badge variant="outline">System</Badge> : null}
      {role.admin_access ? <Badge>Admin area</Badge> : null}
      {role.app_access ? <Badge variant="secondary">App</Badge> : <Badge variant="outline">No app</Badge>}
      {role.api_access ? <Badge variant="secondary">API</Badge> : <Badge variant="outline">No API</Badge>}
    </>
  );
}

export default function AccessStudio({ data }: EtViewProps) {
  const initial = data.overview as Overview;
  const runtime = data.runtime as CmsRuntimeConfig | undefined;
  const [overview, setOverview] = useState<Overview>(initial);
  const [tab, setTab] = useState("roles");

  const [roleOpen, setRoleOpen] = useState(false);
  const [roleForm, setRoleForm] = useState<RoleForm>(emptyRole());
  const [roleSaving, setRoleSaving] = useState(false);

  const firstEditable = initial.roles.find((role) => !role.is_system) ?? initial.roles[0];
  const [selectedRoleId, setSelectedRoleId] = useState<number>(firstEditable?.id ?? 0);
  const [matrix, setMatrix] = useState<Record<string, Record<CmsPermissionAction, boolean>>>(
    matrix_from_permissions(initial.permissions[firstEditable?.id ?? 0] ?? [])
  );
  const [permissionSaving, setPermissionSaving] = useState(false);

  const [keyOpen, setKeyOpen] = useState(false);
  const [keyForm, setKeyForm] = useState<KeyForm>(emptyKey());
  const [keySaving, setKeySaving] = useState(false);
  const [createdKey, setCreatedKey] = useState<CmsApiKeyWithSecret | null>(null);

  const selectedRole = useMemo(
    () => overview.roles.find((role) => role.id === selectedRoleId) ?? null,
    [overview.roles, selectedRoleId]
  );

  const refresh = useCallback(async () => {
    try {
      const state = await cms_call<AccessState>("access_state");
      setOverview(state.overview);
      const nextRole =
        state.overview.roles.find((role) => role.id === selectedRoleId) ??
        state.overview.roles.find((role) => !role.is_system) ??
        state.overview.roles[0];
      if (nextRole) {
        setSelectedRoleId(nextRole.id);
        setMatrix(matrix_from_permissions(state.overview.permissions[nextRole.id] ?? []));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh access settings.");
    }
  }, [selectedRoleId]);

  const selectRole = useCallback(
    (role: CmsRole) => {
      setSelectedRoleId(role.id);
      setMatrix(matrix_from_permissions(overview.permissions[role.id] ?? []));
    },
    [overview.permissions]
  );

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
    });
    setRoleOpen(true);
  }, []);

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
      if (!window.confirm(`Delete the role '${role.name}'? Users must be moved first.`)) return;
      try {
        await cms_call("access_role_delete", { id: role.id });
        toast.success("Role deleted.");
        await refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete the role.");
      }
    },
    [refresh]
  );

  const togglePermission = useCallback(
    (collection: string, action: CmsPermissionAction) => {
      setMatrix((current) => {
        const row = current[collection] ?? {
          read: false,
          create: false,
          update: false,
          delete: false,
        };
        return {
          ...current,
          [collection]: { ...row, [action]: !row[action] },
        };
      });
    },
    []
  );

  const savePermissions = useCallback(async () => {
    if (!selectedRole) return;
    setPermissionSaving(true);
    try {
      const permissions: Array<{
        collection: string;
        action: CmsPermissionAction;
        fields: string[];
      }> = [];
      for (const [collection, actions] of Object.entries(matrix)) {
        for (const action of ACTIONS) {
          if (actions[action.key]) {
            permissions.push({ collection, action: action.key, fields: [] });
          }
        }
      }
      await cms_call("access_permissions_save", {
        role_id: selectedRole.id,
        permissions,
      });
      toast.success(`Permissions saved for ${selectedRole.name}.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save permissions.");
    } finally {
      setPermissionSaving(false);
    }
  }, [matrix, refresh, selectedRole]);

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
        toast.error(error instanceof Error ? error.message : "Could not update the user role.");
      }
    },
    [refresh]
  );

  const openCreateKey = useCallback(() => {
    const defaultRole =
      overview.roles.find((role) => role.api_access && !role.is_system) ??
      overview.roles.find((role) => role.api_access);
    setKeyForm({ ...emptyKey(), role_id: defaultRole ? String(defaultRole.id) : "" });
    setKeyOpen(true);
  }, [overview.roles]);

  const saveKey = useCallback(async () => {
    setKeySaving(true);
    try {
      const created = await cms_call<CmsApiKeyWithSecret>("access_key_create", {
        name: keyForm.name,
        role_id: Number(keyForm.role_id),
        expires_at: keyForm.expires_at || null,
      });
      setCreatedKey(created);
      setKeyOpen(false);
      toast.success("API key created. Copy it now; it will not be shown again.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the API key.");
    } finally {
      setKeySaving(false);
    }
  }, [keyForm, refresh]);

  const revokeKey = useCallback(
    async (key: CmsApiKey) => {
      if (!window.confirm(`Revoke the API key '${key.name}'? Existing clients will stop working.`)) {
        return;
      }
      try {
        await cms_call("access_key_revoke", { id: key.id });
        toast.success("API key revoked.");
        await refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not revoke the API key.");
      }
    },
    [refresh]
  );

  const deleteKey = useCallback(
    async (key: CmsApiKey) => {
      if (!window.confirm(`Permanently delete the API key '${key.name}'?`)) return;
      try {
        await cms_call("access_key_delete", { id: key.id });
        toast.success("API key deleted.");
        await refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete the API key.");
      }
    },
    [refresh]
  );

  const collectionsForMatrix = useMemo(
    () => [
      { name: "*", label: "All collections" },
      ...overview.collections.filter((collection) => collection.name !== "*"),
    ],
    [overview.collections]
  );

  const apiRoles = overview.roles.filter((role) => role.api_access);
  const activeKeys = overview.api_keys.filter((key) => key.active).length;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Access control"
        title="Access & API keys"
        description="Roles decide who can enter the app, who can call the API, and which collections they can read or write. APIs are private by default."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/administrators/manage">
                <Users className="size-4" />
                Manage users
              </Link>
            </Button>
            <Button onClick={openCreateRole}>
              <Plus className="size-4" />
              New role
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="grid size-9 place-items-center rounded-lg bg-muted">
              <Shield className="size-4" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Roles</p>
              <p className="text-xl font-semibold">{overview.roles.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="grid size-9 place-items-center rounded-lg bg-muted">
              <UserRound className="size-4" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Users</p>
              <p className="text-xl font-semibold">{overview.users.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="grid size-9 place-items-center rounded-lg bg-muted">
              <KeyRound className="size-4" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Active keys</p>
              <p className="text-xl font-semibold">{activeKeys}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="keys">API keys</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <Card className="h-fit">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Roles</CardTitle>
                <CardDescription>App and API access is granted per role.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 p-2">
                {overview.roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => selectRole(role)}
                    className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                      role.id === selectedRoleId
                        ? "border-foreground/20 bg-muted/60"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{role.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {role.user_count} user{role.user_count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">{roleBadges(role)}</span>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>{selectedRole ? selectedRole.name : "Select a role"}</CardTitle>
                  <CardDescription>
                    {selectedRole?.description ||
                      "Choose a role on the left to edit its collection permissions."}
                  </CardDescription>
                </div>
                {selectedRole ? (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEditRole(selectedRole)}
                    >
                      <Pencil className="size-3.5" />
                      Edit role
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
                    icon={<Shield className="size-5" />}
                    title="No role selected"
                    description="Create a role or select one from the list."
                    action={<Button onClick={openCreateRole}>New role</Button>}
                  />
                ) : selectedRole.is_system ? (
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                    <p className="flex items-center gap-2 font-medium">
                      <ShieldCheck className="size-4" />
                      Full access
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      The system Admin role always has every collection permission and cannot be
                      restricted. Create a separate role for editors or API clients.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40 text-left">
                            <th className="px-3 py-2 font-medium text-muted-foreground">Collection</th>
                            {ACTIONS.map((action) => (
                              <th
                                key={action.key}
                                className="px-3 py-2 text-center font-medium text-muted-foreground"
                              >
                                {action.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {collectionsForMatrix.map((collection) => {
                            const row = matrix[collection.name] ?? {
                              read: false,
                              create: false,
                              update: false,
                              delete: false,
                            };
                            return (
                              <tr key={collection.name} className="border-b last:border-b-0">
                                <td className="px-3 py-2">
                                  <span className="font-medium">{collection.label}</span>
                                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                                    {collection.name}
                                  </span>
                                </td>
                                {ACTIONS.map((action) => (
                                  <td key={action.key} className="px-3 py-2 text-center">
                                    <Checkbox
                                      checked={row[action.key]}
                                      onCheckedChange={() =>
                                        togglePermission(collection.name, action.key)
                                      }
                                      aria-label={`${action.label} ${collection.label}`}
                                    />
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Empty permissions mean no access. Field-level limits can be set through the
                        API for advanced cases.
                      </p>
                      <BusyButton type="button" busy={permissionSaving} onClick={savePermissions}>
                        <Check className="size-4" />
                        Save permissions
                      </BusyButton>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Users and roles</CardTitle>
              <CardDescription>
                Assign a role to each account. App access controls the application; API access
                controls tokens and API keys.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overview.users.length === 0 ? (
                <EmptyState
                  icon={<Users className="size-5" />}
                  title="No users yet"
                  description="Create administrator accounts in Manage Users, then assign roles here."
                  action={
                    <Button asChild>
                      <Link href="/administrators/manage">Manage users</Link>
                    </Button>
                  }
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="px-3 py-2 font-medium text-muted-foreground">User</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">Email</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">Role</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.users.map((user) => (
                        <tr key={user.id} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-medium">{user.username || `#${user.id}`}</td>
                          <td className="px-3 py-2 text-muted-foreground">{user.email || "—"}</td>
                          <td className="px-3 py-2">
                            <Select
                              value={user.role_id ? String(user.role_id) : ""}
                              onValueChange={(value) => changeUserRole(user, value)}
                            >
                              <SelectTrigger className="w-[190px]">
                                <SelectValue placeholder="Unassigned" />
                              </SelectTrigger>
                              <SelectContent>
                                {overview.roles.map((role) => (
                                  <SelectItem key={role.id} value={String(role.id)}>
                                    {role.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={user.active ? "default" : "secondary"}>
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
        </TabsContent>

        <TabsContent value="keys" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle>API keys</CardTitle>
                <CardDescription>
                  Keys inherit the permissions of their role. Send them as{" "}
                  <code className="font-mono text-[11px]">Authorization: Bearer etk_...</code>.
                </CardDescription>
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
                  description="Create a key for a server, script or integration. Keys are shown once and stored as hashes."
                  action={<Button onClick={openCreateKey}>Create API key</Button>}
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[780px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="px-3 py-2 font-medium text-muted-foreground">Name</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">Key</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">Role</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">Last used</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">Expires</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">Status</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.api_keys.map((key) => (
                        <tr key={key.id} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-medium">{key.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            etk_{key.key_prefix}_…
                          </td>
                          <td className="px-3 py-2">{key.role_name || `#${key.role_id}`}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {format_relative(key.last_used_at)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {key.expires_at ? format_datetime(key.expires_at * 1000) : "Never"}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={key.active ? "default" : "secondary"}>
                              {key.active ? "Active" : "Revoked"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
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
        </TabsContent>
      </Tabs>

      <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          Auth provider: <strong>{runtime?.auth.label ?? "Built-in accounts"}</strong>. API keys work
          independently of the sign-in provider. Revoking a key takes effect immediately for new
          requests.
        </p>
      </div>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{roleForm.id ? "Edit role" : "New role"}</DialogTitle>
            <DialogDescription>
              App access controls the application. API access controls API keys and tokens.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                value={roleForm.name}
                placeholder="Editor"
                disabled={roleForm.id > 0 && selectedRole?.is_system === true}
                onChange={(event) =>
                  setRoleForm((form) => ({ ...form, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-description">Description</Label>
              <Input
                id="role-description"
                value={roleForm.description}
                placeholder="Can edit posts but cannot manage access."
                onChange={(event) =>
                  setRoleForm((form) => ({ ...form, description: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={roleForm.app_access}
                  onCheckedChange={(checked) =>
                    setRoleForm((form) => ({ ...form, app_access: checked === true }))
                  }
                />
                <span>
                  <span className="block font-medium">App access</span>
                  <span className="block text-xs text-muted-foreground">
                    Allow users with this role to sign in to the application.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={roleForm.api_access}
                  onCheckedChange={(checked) =>
                    setRoleForm((form) => ({ ...form, api_access: checked === true }))
                  }
                />
                <span>
                  <span className="block font-medium">API access</span>
                  <span className="block text-xs text-muted-foreground">
                    Allow tokens and API keys for this role to call the content API.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={roleForm.admin_access}
                  onCheckedChange={(checked) =>
                    setRoleForm((form) => ({ ...form, admin_access: checked === true }))
                  }
                />
                <span>
                  <span className="block font-medium">Admin area</span>
                  <span className="block text-xs text-muted-foreground">
                    Allow this role to open Data Studio, Access and Project settings.
                  </span>
                </span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRoleOpen(false)}>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              The secret is shown once. Store it in the server environment or your integration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={keyForm.role_id}
                onValueChange={(value) => setKeyForm((form) => ({ ...form, role_id: value }))}
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
                <p className="text-[11px] text-destructive">
                  Enable API access on a role before creating a key.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="key-expiry">Expires</Label>
              <Input
                id="key-expiry"
                type="date"
                value={keyForm.expires_at}
                onChange={(event) =>
                  setKeyForm((form) => ({ ...form, expires_at: event.target.value }))
                }
              />
              <p className="text-[11px] text-muted-foreground">Leave empty for no expiry.</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setKeyOpen(false)}>
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

      <Dialog open={createdKey !== null} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              Copy this secret now. It is stored as a hash and cannot be recovered.
            </DialogDescription>
          </DialogHeader>
          {createdKey ? (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {createdKey.name}
                </p>
                <p className="mt-1 break-all font-mono text-xs">{createdKey.secret}</p>
              </div>
              <div className="flex gap-2">
                <CopyButton value={createdKey.secret} label="Copy key" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreatedKey(null);
                    setTab("keys");
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
