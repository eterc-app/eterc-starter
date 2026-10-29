"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CalendarClock,
  KeyRound,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { Notice } from "@/components/app/Notice";
import { PageActions } from "@/components/app/PageActions";
import { PageActionsPortal } from "@/components/app/PageActionsSlot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EtViewProps } from "@/engine/views-registry";
import type {
  CmsApiKey,
  CmsApiKeyWithSecret,
  CmsPermission,
  CmsProfileOverview,
  CmsRole,
} from "@/modules/cms/cms-types";
import {
  BusyButton,
  CopyButton,
  EmptyState,
  cms_call,
  format_datetime,
  format_relative,
} from "./ui";

function role_badges(role: CmsRole) {
  return (
    <>
      {role.is_system ? <Badge variant="outline">System</Badge> : null}
      {role.admin_access ? <Badge>Admin area</Badge> : null}
      {role.app_access ? <Badge variant="secondary">App</Badge> : null}
      {role.api_access ? <Badge variant="secondary">API</Badge> : null}
    </>
  );
}

function is_expired(key: CmsApiKey): boolean {
  return key.expires_at !== null && key.expires_at <= Math.floor(Date.now() / 1000);
}

function permission_label(permission: CmsPermission): string {
  return permission.collection === "*" ? "All collections" : permission.collection;
}

export default function Profile({ data }: EtViewProps) {
  const initial = data.overview as CmsProfileOverview;
  const [overview, setOverview] = useState<CmsProfileOverview>(initial);
  const [api_base, setApiBase] = useState(String(data.api_base ?? ""));
  const [key_open, setKeyOpen] = useState(false);
  const [key_form, setKeyForm] = useState({ name: "", expires_at: "" });
  const [key_saving, setKeySaving] = useState(false);
  const [created_key, setCreatedKey] = useState<CmsApiKeyWithSecret | null>(null);
  const { confirm, dialog: confirm_dialog } = useConfirm();

  const account = overview.account;
  const display_name = useMemo(() => {
    const full = [account.first_name, account.last_name]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");
    return full || account.username || account.email || "Account";
  }, [account]);
  const initials = useMemo(() => {
    const first = account.first_name.trim();
    const last = account.last_name.trim();
    if (first && last) return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
    return (account.username || account.email || "A").slice(0, 2).toUpperCase();
  }, [account]);

  const refresh = useCallback(async () => {
    const state = await cms_call<{
      overview: CmsProfileOverview;
      api_base: string;
    }>("profile_state");
    setOverview(state.overview);
    setApiBase(state.api_base);
  }, []);

  const open_create_key = useCallback(() => {
    setKeyForm({ name: "", expires_at: "" });
    setKeyOpen(true);
  }, []);

  const save_key = useCallback(async () => {
    if (!key_form.name.trim()) return;
    setKeySaving(true);
    try {
      const key = await cms_call<CmsApiKeyWithSecret>("profile_key_create", {
        name: key_form.name.trim(),
        expires_at: key_form.expires_at || null,
      });
      setKeyOpen(false);
      setKeyForm({ name: "", expires_at: "" });
      setCreatedKey(key);
      await refresh();
      toast.success("API key created.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create the API key."
      );
    } finally {
      setKeySaving(false);
    }
  }, [key_form, refresh]);

  const revoke_key = useCallback(
    async (key: CmsApiKey) => {
      const confirmed = await confirm({
        title: "Revoke API key?",
        description: (
          <>
            <span className="font-semibold">{key.name}</span> will stop working
            immediately. This cannot be undone.
          </>
        ),
        confirmLabel: "Revoke key",
        tone: "destructive",
      });
      if (!confirmed) return;
      try {
        await cms_call("profile_key_revoke", { id: key.id });
        await refresh();
        toast.success("API key revoked.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not revoke the API key."
        );
      }
    },
    [confirm, refresh]
  );

  return (
    <div className="app-page">
      <PageActionsPortal>
        <PageActions
          items={[
            {
              label: "Update password",
              icon: <KeyRound className="size-4" />,
              href: String(data.update_password_url ?? ""),
            },
          ]}
        />
      </PageActionsPortal>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-6">
          <Card aria-label="Profile account">
            <CardHeader className="flex flex-row items-start gap-4 border-b border-border">
              <span className="grid size-12 shrink-0 place-items-center rounded-full border border-border bg-surface-subtle text-sm font-semibold">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate">{display_name}</CardTitle>
                <CardDescription className="truncate">
                  {account.email || "No email address"}
                </CardDescription>
              </div>
              <Badge variant={account.active ? "success" : "outline"}>
                {account.active ? "Active" : "Suspended"}
              </Badge>
            </CardHeader>
            <CardContent className="pt-6">
              <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">Username</dt>
                  <dd className="text-right font-mono text-xs">
                    {account.username || "—"}
                  </dd>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">Email</dt>
                  <dd className="text-right">{account.email || "—"}</dd>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">Job title</dt>
                  <dd className="text-right">{account.title || "—"}</dd>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">Role</dt>
                  <dd className="text-right">
                    <Badge variant="outline">{overview.role.name}</Badge>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card aria-label="API keys">
            <CardHeader className="flex flex-col gap-3 border-b border-border sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>API keys</CardTitle>
                <CardDescription>
                  Keys act as your account and inherit your role and policies
                  when created. The secret is shown once.
                </CardDescription>
              </div>
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={open_create_key}
                disabled={!overview.role.api_access}
              >
                <Plus className="size-4" />
                Create API key
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {overview.api_keys.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={<KeyRound className="size-5" strokeWidth={1.75} />}
                    title="No API keys"
                    description="Create a key for a script, integration, or another tool. It will have the same access as your role."
                    action={
                      <Button
                        type="button"
                        variant="outline"
                        onClick={open_create_key}
                        disabled={!overview.role.api_access}
                      >
                        Create API key
                      </Button>
                    }
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-4">Name</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Last used</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="px-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.api_keys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="px-4 font-semibold">
                          {key.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          etk_{key.key_prefix}_…
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format_datetime(
                            new Date(key.created_at * 1000).toISOString()
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format_relative(key.last_used_at)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {key.expires_at
                            ? format_datetime(
                                new Date(key.expires_at * 1000).toISOString()
                              )
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              key.active && !is_expired(key)
                                ? "success"
                                : "outline"
                            }
                          >
                            {key.active
                              ? is_expired(key)
                                ? "Expired"
                                : "Active"
                              : "Revoked"}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 text-right">
                          {key.active ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => revoke_key(key)}
                            >
                              Revoke
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="grid content-start gap-6">
          <Card aria-label="Role and policies">
            <CardHeader className="border-b border-border">
              <CardTitle>Role & policies</CardTitle>
              <CardDescription>
                Every API key you create uses this access boundary.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 pt-6">
              <div className="flex flex-wrap gap-2">
                {role_badges(overview.role)}
              </div>
              <dl className="grid gap-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Role</dt>
                  <dd className="text-right font-semibold">{overview.role.name}</dd>
                </div>
                {overview.parent_role_name ? (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-muted-foreground">Inherits from</dt>
                    <dd className="text-right">{overview.parent_role_name}</dd>
                  </div>
                ) : null}
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Policies</dt>
                  <dd className="text-right">
                    {overview.role.admin_access
                      ? "Full access"
                      : `${overview.permissions.length} direct`}
                  </dd>
                </div>
              </dl>
              {overview.role.admin_access ? (
                <Notice icon={ShieldCheck}>
                  The Administrator role bypasses collection policies. Treat keys
                  created here as full-access credentials.
                </Notice>
              ) : overview.permissions.length === 0 ? (
                <Notice icon={ShieldCheck}>
                  No direct policies are assigned. Access may be inherited from a
                  parent role.
                </Notice>
              ) : (
                <ul className="grid gap-2">
                  {overview.permissions.map((permission) => (
                    <li
                      key={permission.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <span className="min-w-0 truncate font-mono text-xs">
                        {permission_label(permission)}
                      </span>
                      <Badge variant="outline">{permission.action}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card aria-label="API security">
            <CardHeader className="border-b border-border">
              <CardTitle>API security</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-6">
              <Notice icon={ShieldCheck} tone="warning">
                API keys are passwords. Store them in a secret manager, never in
                source control, and revoke them immediately if exposed.
              </Notice>
              <div className="grid gap-2">
                <span className="type-headline">Base URL</span>
                <code className="break-all rounded-lg border border-border bg-surface-subtle px-3 py-2 font-mono text-xs">
                  {api_base || "/api/v1/cms"}
                </code>
              </div>
              <p className="type-note">
                Send the key as{" "}
                <span className="font-mono text-xs">
                  Authorization: Bearer etk_…
                </span>{" "}
                or{" "}
                <span className="font-mono text-xs">X-API-Key</span>. Expired and
                revoked keys are rejected.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={key_open} onOpenChange={setKeyOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3">
              <Label htmlFor="profile-key-name">Name</Label>
              <Input
                id="profile-key-name"
                value={key_form.name}
                placeholder="Production integration"
                maxLength={80}
                onChange={(event) =>
                  setKeyForm((form) => ({ ...form, name: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-3">
              <Label htmlFor="profile-key-expiry">Expires</Label>
              <Input
                id="profile-key-expiry"
                type="date"
                value={key_form.expires_at}
                onChange={(event) =>
                  setKeyForm((form) => ({
                    ...form,
                    expires_at: event.target.value,
                  }))
                }
              />
              <p className="type-note">
                Leave blank for no expiry. The date must be in the future.
              </p>
            </div>
            <Notice icon={CalendarClock}>
              This key inherits the{" "}
              <span className="font-semibold">{overview.role.name}</span> role as
              it exists now. Its secret is displayed once and cannot be
              recovered.
            </Notice>
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
              busy={key_saving}
              onClick={save_key}
              disabled={!key_form.name.trim()}
            >
              Create key
            </BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={created_key !== null}
        onOpenChange={(open) => !open && setCreatedKey(null)}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
          </DialogHeader>
          {created_key ? (
            <div className="grid gap-3">
              <div className="rounded-lg border border-border bg-surface-subtle p-4">
                <p className="break-all font-mono text-xs">{created_key.secret}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={created_key.secret} label="Copy key" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreatedKey(null)}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {confirm_dialog}
    </div>
  );
}
