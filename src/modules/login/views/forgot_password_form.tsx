import type { EtViewProps } from "@/engine/views-registry";
import { EtForm } from "@/engine/ui/EtForm";
import { Flashdata } from "@/engine/ui/Flashdata";
import { site_url } from "@/engine/Url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./AuthShell";
export function ForgotPasswordForm({ data }: EtViewProps) {
  const identifierLabel = String(data.identifier_label ?? "");
  const loginUrl = String(data.login_url ?? "");
  const lowerLabel = identifierLabel.toLowerCase();
  const instruction = lowerLabel.includes("email")
    ? `Enter your ${lowerLabel} and we will send you a reset link.`
    : `Enter your ${lowerLabel} or email address and we will send you a reset link.`;

  return (
    <AuthShell title="Forgot your password?" description={instruction}>
      <Flashdata />

      <EtForm
        action="login/submit_forgot_password"
        params={[loginUrl]}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="identifier">{identifierLabel}</Label>
          <Input
            id="identifier"
            type="text"
            name="identifier"
            placeholder={`${identifierLabel} or Email`}
            autoComplete="email"
            required
          />
        </div>

        <Button type="submit" className="w-full">
          Send Reset Link
        </Button>
      </EtForm>

      <p className="mt-5 border-t pt-4 text-center text-sm">
        <a
          className="font-medium text-primary underline-offset-4 hover:underline"
          href={site_url(`login/login/${loginUrl}`)}
        >
          Back to login
        </a>
      </p>
    </AuthShell>
  );
}
