import type { EtViewProps } from "@/engine/views-registry";
import { EtForm } from "@/engine/ui/EtForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import { site_url } from "@/engine/Url";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function LoginSplit({ data }: EtViewProps) {
  const identifierLabel = String(data.identifier_label ?? "");
  const passwordLabel = String(
    (data.fields as { password?: { label?: string } } | undefined)?.password?.label ??
      "Password"
  );
  const loginUrl = String(data.login_url ?? "");
  const forgotUrl =
    typeof data.forgot_password_url === "string" ? data.forgot_password_url : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="grid w-full max-w-4xl gap-0 overflow-hidden border-border p-0 md:grid-cols-2">
        <div className="hidden min-h-[32rem] bg-[url('/login_module/images/surfgirl.webp')] bg-cover bg-center md:block" />
        <div className="p-8 sm:p-10">
          <p className="type-headline text-center">Eterc CMS</p>
          <h1 className="type-title mt-1 text-center">
            Account login
          </h1>

          <ValidationErrors />

          <EtForm action="login/submit_login" params={[loginUrl]} className="mt-6 space-y-5">
            <div className="space-y-3">
              <Label htmlFor="identifier">{identifierLabel}</Label>
              <Input
                id="identifier"
                type="text"
                name="identifier"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="password">{passwordLabel}</Label>
              <Input
                id="password"
                type="password"
                name="password"
                autoComplete="current-password"
                required
              />
            </div>

            <Button type="submit" className="w-full">
              Sign in
            </Button>

            {forgotUrl !== null ? (
              <p className="text-center text-sm">
                <a
                  className="font-semibold text-foreground underline-offset-4 hover:underline"
                  href={site_url(forgotUrl)}
                >
                  Forgot password?
                </a>
              </p>
            ) : null}
          </EtForm>
        </div>
      </Card>
    </main>
  );
}
