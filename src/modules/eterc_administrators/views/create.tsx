"use client";

import { useMemo, useState } from "react";
import { EtForm } from "@/engine/ui/EtForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import type { EtViewProps } from "@/engine/views-registry";
import { PageActions } from "@/components/app/PageActions";
import { PageActionsPortal } from "@/components/app/PageActionsSlot";
import { Notice } from "@/components/app/Notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CmsRole } from "@/modules/cms/cms-types";
import {
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";

function generate_password(): string {
  const bytes = new Uint32Array(20);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]).join("");
}

export default function Create({ data }: EtViewProps) {
  const update_id = Number(data.update_id ?? 0);
  const is_update = data.id !== undefined && data.id !== null;
  const roles = useMemo(
    () => (data.roles ?? []) as CmsRole[],
    [data.roles]
  );

  const [username, setUsername] = useState(String(data.username ?? ""));
  const [email, setEmail] = useState(String(data.email ?? ""));
  const [first_name, setFirstName] = useState(String(data.first_name ?? ""));
  const [last_name, setLastName] = useState(String(data.last_name ?? ""));
  const [title, setTitle] = useState(String(data.title ?? ""));
  const [role_id, setRoleId] = useState(
    String(data.role_id ?? roles[0]?.id ?? "")
  );
  const [active, setActive] = useState(() => {
    if (!is_update && (data.active === undefined || String(data.active) === "")) {
      return "1";
    }
    return Number(data.active) === 1 ? "1" : "0";
  });
  const [password, setPassword] = useState("");
  const [confirm_password, setConfirmPassword] = useState("");
  const [show_password, setShowPassword] = useState(false);

  const selected_role = useMemo(
    () => roles.find((role) => String(role.id) === role_id) ?? null,
    [role_id, roles]
  );

  const use_generated_password = () => {
    const generated = generate_password();
    setPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true);
  };

  const role_note = selected_role
    ? selected_role.admin_access
      ? "This role can open the admin area and manage the workspace."
      : selected_role.api_access
        ? "This role can use the API, but cannot open the admin area."
        : "This role has no app or API access until its policies are changed."
    : "Choose the access level for this account.";

  return (
    <div className="app-page">
      {is_update ? (
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
      ) : null}

      <ValidationErrors />

      <EtForm
        action="eterc_administrators/submit"
        params={[update_id]}
        className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]"
      >
        <div className="grid gap-6">
          <Card>
            <CardHeader className="border-b border-border">
              <CardTitle>Identity</CardTitle>
              <CardDescription>
                The person, sign-in name, and contact address for this account.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 pt-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-3">
                  <Label htmlFor="first_name">First name</Label>
                  <Input
                    id="first_name"
                    type="text"
                    name="first_name"
                    value={first_name}
                    onChange={(event) => setFirstName(event.target.value)}
                    autoComplete="given-name"
                    maxLength={80}
                  />
                </div>
                <div className="grid gap-3">
                  <Label htmlFor="last_name">Last name</Label>
                  <Input
                    id="last_name"
                    type="text"
                    name="last_name"
                    value={last_name}
                    onChange={(event) => setLastName(event.target.value)}
                    autoComplete="family-name"
                    maxLength={80}
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  maxLength={190}
                  required
                />
                <p className="type-note">
                  Used for sign-in and for linking a verified GitHub or Google
                  account.
                </p>
              </div>

              <div className="grid gap-3">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  name="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  maxLength={50}
                  required
                />
                <p className="type-note">
                  Letters, numbers, and underscores only. The username can also
                  be used to sign in.
                </p>
              </div>

              <div className="grid gap-3">
                <Label htmlFor="title">Job title</Label>
                <Input
                  id="title"
                  type="text"
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  autoComplete="organization-title"
                  maxLength={120}
                  placeholder="Content editor"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border">
              <CardTitle>Credentials</CardTitle>
              <CardDescription>
                {is_update
                  ? "Leave both password fields blank to keep the current password."
                  : "Set an initial password and share it over a secure channel."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 pt-6">
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="password">
                    {is_update ? "New password" : "Password"}
                  </Label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={use_generated_password}
                    >
                      <RefreshCw className="size-3.5" />
                      Generate
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={show_password ? "Hide password" : "Show password"}
                    >
                      {show_password ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                      {show_password ? "Hide" : "Show"}
                    </Button>
                  </div>
                </div>
                <Input
                  id="password"
                  type={show_password ? "text" : "password"}
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={200}
                  required={!is_update}
                />
                <p className="type-note">
                  Use at least 12 characters. Passwords are hashed with bcrypt
                  and are never stored or displayed in plain text.
                </p>
              </div>

              <div className="grid gap-3">
                <Label htmlFor="confirm_password">Confirm password</Label>
                <Input
                  id="confirm_password"
                  type={show_password ? "text" : "password"}
                  name="confirm_password"
                  value={confirm_password}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={200}
                  required={!is_update || password !== ""}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader className="border-b border-border">
              <CardTitle>Access</CardTitle>
              <CardDescription>
                Role and sign-in status. API keys use the same policies as the
                role.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 pt-6">
              <div className="grid gap-3">
                <Label htmlFor="role_id">Role</Label>
                <Select
                  name="role_id"
                  value={role_id}
                  onValueChange={setRoleId}
                  required
                >
                  <SelectTrigger id="role_id" className="w-full">
                    <SelectValue placeholder="Choose a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={String(role.id)}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="type-note">{role_note}</p>
                <div className="flex flex-wrap gap-2">
                  {selected_role?.is_system ? (
                    <Badge variant="outline">System</Badge>
                  ) : null}
                  {selected_role?.app_access ? (
                    <Badge variant="secondary">App access</Badge>
                  ) : null}
                  {selected_role?.api_access ? (
                    <Badge variant="secondary">API access</Badge>
                  ) : null}
                  {selected_role?.admin_access ? (
                    <Badge>Admin area</Badge>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3">
                <Label htmlFor="active">Status</Label>
                <Select name="active" value={active} onValueChange={setActive}>
                  <SelectTrigger id="active" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Active</SelectItem>
                    <SelectItem value="0">Suspended</SelectItem>
                  </SelectContent>
                </Select>
                <p className="type-note">
                  Suspended accounts cannot sign in, and their sessions are
                  revoked.
                </p>
              </div>

              <Button asChild variant="outline" className="w-full">
                <a href="/admin/access">
                  <Users className="size-4" />
                  Manage roles and policies
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border">
              <CardTitle>Security</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <Notice icon={ShieldCheck}>
                Passwords are hashed before they reach the database. Share the
                initial password through a secure channel and ask the user to
                change it after signing in.
              </Notice>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row xl:col-span-2">
          <Button type="submit" name="submit" value="Submit">
            {is_update ? "Save user" : "Create user"}
          </Button>
          <Button asChild variant="outline">
            <a href={String(data.cancel_url ?? "")}>Cancel</a>
          </Button>
        </div>
      </EtForm>
    </div>
  );
}
