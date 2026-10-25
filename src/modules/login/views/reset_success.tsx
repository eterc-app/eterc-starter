import { CheckCircle2 } from "lucide-react";
import { site_url } from "@/engine/Url";
import { Button } from "@/components/ui/button";
import { AuthShell } from "./AuthShell";
export function ResetSuccess() {
  return (
    <AuthShell
      title="Password reset complete"
      description="Your password has been updated successfully. You can now log in using your new password."
    >
      <div className="mb-5 flex justify-center text-success">
        <CheckCircle2 aria-hidden="true" className="size-12" />
      </div>

      <Button asChild className="w-full">
        <a href={site_url("login")}>Log in</a>
      </Button>
    </AuthShell>
  );
}
