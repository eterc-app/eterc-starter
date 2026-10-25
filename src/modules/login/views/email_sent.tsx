import { Mail } from "lucide-react";
import type { EtViewProps } from "@/engine/views-registry";
import { site_url } from "@/engine/Url";
import { AuthShell } from "./AuthShell";
export function EmailSent({ data }: EtViewProps) {
  const loginUrl = String(data.login_url ?? "");

  return (
    <AuthShell
      title="Check your email"
      description="If an account with that email address exists, you will receive a password reset link shortly."
    >
      <div className="mb-5 flex justify-center text-foreground">
        <Mail aria-hidden="true" className="size-12" />
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Please check your inbox (and spam folder) and click the link to reset
        your password.
      </p>

      <div className="mt-6 border-t border-border pt-4 text-center text-sm">
        <a
          className="font-semibold text-foreground underline-offset-4 hover:underline"
          href={site_url(`login/login/${loginUrl}`)}
        >
          Back to login
        </a>
      </div>
    </AuthShell>
  );
}
