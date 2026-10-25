import { AlertTriangle } from "lucide-react";
import type { EtViewProps } from "@/engine/views-registry";
import { site_url } from "@/engine/Url";
import { Notice } from "@/components/app/Notice";
import { Button } from "@/components/ui/button";
import { AuthShell } from "./AuthShell";

export function NotAllowed({ data }: EtViewProps) {
  const blockDuration = Number(data.block_duration ?? 15);
  const loginUrl = String(data.login_url ?? "");

  return (
    <AuthShell
      title="Access temporarily blocked"
      description="Too many failed sign-in attempts were detected for this account or IP address."
    >
      <Notice icon={AlertTriangle} tone="destructive">
        Please wait {blockDuration} minutes before trying again.
      </Notice>
      <Button asChild variant="outline" className="mt-5 w-full">
        <a href={site_url(`login/login/${loginUrl}`)}>Return to sign in</a>
      </Button>
    </AuthShell>
  );
}
