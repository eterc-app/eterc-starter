import type { EtViewProps } from "@/engine/views-registry";
import { EtForm } from "@/engine/ui/EtForm";
import { site_url } from "@/engine/Url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./AuthShell";
export function ResetPasswordForm({ data }: EtViewProps) {
  const errorMessage =
    typeof data.error_message === "string" && data.error_message !== ""
      ? data.error_message
      : null;
  const token = typeof data.token === "string" && data.token !== "" ? data.token : null;

  if (token === null) {
    return (
      <AuthShell
        title="Invalid or expired link"
        description={
          errorMessage ??
          "This password reset link is invalid or has expired."
        }
      >
        <div className="border-t border-border pt-4 text-center text-sm">
          <a
            className="font-semibold text-foreground underline-offset-4 hover:underline"
            href={site_url("login/forgot_password")}
          >
            Request a new reset link
          </a>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your new password below."
    >
      {errorMessage !== null ? (
        <div className="mb-4 rounded-xl border border-border border-l-4 border-l-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <EtForm
        action="login/submit_reset_password"
        hidden={{ token }}
        className="space-y-5"
      >
        <div className="space-y-3">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
          />
          <p className="type-note">Use at least 8 characters.</p>
        </div>

        <div className="space-y-3">
          <Label htmlFor="confirm_password">Confirm new password</Label>
          <Input
            id="confirm_password"
            type="password"
            name="confirm_password"
            autoComplete="new-password"
            required
          />
        </div>

        <Button type="submit" className="w-full">
          Reset password
        </Button>
      </EtForm>
    </AuthShell>
  );
}
