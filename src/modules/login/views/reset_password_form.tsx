import type { EtViewProps } from "@/engine/views-registry";
import { EtForm } from "@/engine/ui/EtForm";
import { site_url } from "@/engine/Url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./AuthShell";

/**
 * Reset password form — port of
 * modules/login/forgot_password/views/reset_password_form.php.
 */
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
        <div className="border-t pt-4 text-center text-sm">
          <a
            className="font-medium text-primary underline-offset-4 hover:underline"
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
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <EtForm
        action="login/submit_reset_password"
        hidden={{ token }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <Input
            id="password"
            type="password"
            name="password"
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm_password">Confirm New Password</Label>
          <Input
            id="confirm_password"
            type="password"
            name="confirm_password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            required
          />
        </div>

        <Button type="submit" className="w-full">
          Reset Password
        </Button>
      </EtForm>
    </AuthShell>
  );
}
