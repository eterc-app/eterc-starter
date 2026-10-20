import { CheckCircle2 } from "lucide-react";
import { site_url } from "@/engine/Url";
import { Button } from "@/components/ui/button";
import { AuthShell } from "./AuthShell";

/**
 * Password reset complete — port of
 * modules/login/forgot_password/views/reset_success.php.
 */
export function ResetSuccess() {
  return (
    <AuthShell
      title="Password reset complete"
      description="Your password has been updated successfully. You can now log in using your new password."
    >
      <div className="mb-5 flex justify-center text-emerald-600">
        <CheckCircle2 aria-hidden="true" className="size-12" />
      </div>

      <Button asChild className="w-full">
        <a href={site_url("login")}>Log In</a>
      </Button>
    </AuthShell>
  );
}
