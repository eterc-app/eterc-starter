import type { CSSProperties } from "react";
import NextImage from "next/image";
import { CircleAlert } from "lucide-react";
import type { EtViewProps } from "@/engine/views-registry";
import { EtForm } from "@/engine/ui/EtForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import { site_url } from "@/engine/Url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type {
  LoginBackgroundSettings,
  LoginBrandSettings,
  LoginPublicProvider,
} from "../login-types";
import { GithubIcon, GoogleIcon } from "./social-icons";

type SocialProvider = LoginPublicProvider & { href: string };

const FALLBACK_BRAND: LoginBrandSettings = {
  name: "Eterc",
  subtitle: "Private CMS workspace",
  logo: "/company-logo.png",
};

const FALLBACK_BACKGROUND: LoginBackgroundSettings = {
  type: "gradient",
  color: "rgb(17 53 93)",
  gradient: {
    from: "rgb(246 242 238)",
    to: "rgb(214 204 197)",
    angle: 135,
  },
  image: "",
  overlay: {
    color: "rgb(14 28 47)",
    opacity: 0.18,
  },
};

function background_style(background: LoginBackgroundSettings): CSSProperties {
  if (background.type === "solid") {
    return { backgroundColor: background.color };
  }

  if (background.type === "image" && background.image) {
    return {
      backgroundColor: background.color,
      backgroundImage: `url("${background.image}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }

  return {
    backgroundColor: background.color,
    backgroundImage: `linear-gradient(${background.gradient.angle}deg, ${background.gradient.from}, ${background.gradient.to})`,
  };
}

function ProviderIcon({ id }: { id: LoginPublicProvider["id"] }) {
  return id === "github" ? (
    <GithubIcon className="size-4" />
  ) : (
    <GoogleIcon className="size-4" />
  );
}

export function LoginDefault({ data }: EtViewProps) {
  const identifierLabel = String(data.identifier_label ?? "");
  const passwordLabel = String(
    (data.fields as { password?: { label?: string } } | undefined)?.password?.label ??
      "Password"
  );
  const allowRemember = Number(data.allow_remember ?? 0) === 1;
  const loginUrl = String(data.login_url ?? "");
  const forgotUrl =
    typeof data.forgot_password_url === "string" ? data.forgot_password_url : null;
  const brand = (data.brand as LoginBrandSettings | undefined) ?? FALLBACK_BRAND;
  const background =
    (data.background as LoginBackgroundSettings | undefined) ?? FALLBACK_BACKGROUND;
  const providers = Array.isArray(data.social_providers)
    ? (data.social_providers as SocialProvider[])
    : [];
  const siteHost = String(data.site_host ?? "");
  const loginError =
    typeof data.login_error_message === "string" ? data.login_error_message : null;
  const signedOut = data.signed_out === true;
  const hasBackgroundImage = background.type === "image" && Boolean(background.image);
  const logo = brand.logo || FALLBACK_BRAND.logo;

  return (
    <main className="min-h-screen bg-card text-card-foreground lg:grid lg:grid-cols-2">
      <section className="flex min-h-screen flex-col px-6 py-8 sm:px-10 lg:px-14 xl:px-20">
        <div className="flex items-center gap-3">
          <NextImage
            src={logo}
            alt={`${brand.name} logo`}
            width={44}
            height={44}
            priority
            className="size-11 shrink-0 rounded-lg border border-border bg-card object-contain"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{brand.name}</div>
            {brand.subtitle ? (
              <div className="truncate text-xs text-muted-foreground">
                {brand.subtitle}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[380px]">
            <h1 className="text-lg leading-snug font-medium">Welcome back</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to the private CMS workspace.
            </p>

            {loginError ? (
              <div
                role="alert"
                className="mt-6 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            ) : null}

            <ValidationErrors />

            <EtForm
              action="login/submit_login"
              params={[loginUrl]}
              className="mt-6 space-y-5"
              autoComplete="on"
            >
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

              {allowRemember || forgotUrl !== null ? (
                <div
                  className={`flex items-center gap-3 ${
                    allowRemember ? "justify-between" : "justify-end"
                  }`}
                >
                  {allowRemember ? (
                    <Label
                      htmlFor="remember"
                      className="text-sm font-medium text-muted-foreground"
                    >
                      <input
                        id="remember"
                        type="checkbox"
                        name="remember"
                        value="1"
                        className="m-0 size-4 accent-foreground"
                      />
                      Remember me
                    </Label>
                  ) : null}

                  {forgotUrl !== null ? (
                    <a
                      className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                      href={site_url(forgotUrl)}
                    >
                      Forgot password?
                    </a>
                  ) : null}
                </div>
              ) : null}

              <Button type="submit" className="w-full">
                Sign in
              </Button>
            </EtForm>

            {providers.length > 0 ? (
              <div className="mt-6">
                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    or continue with
                  </span>
                  <Separator className="flex-1" />
                </div>

                <div className="mt-4 grid gap-2">
                  {providers.map((provider) => (
                    <Button key={provider.id} asChild variant="outline" className="w-full">
                      <a href={provider.href}>
                        <ProviderIcon id={provider.id} />
                        Continue with {provider.label}
                      </a>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{signedOut ? "You have been signed out." : ""}</span>
              {siteHost ? <span className="lg:hidden">{siteHost}</span> : null}
            </div>
          </div>
        </div>
      </section>

      <aside
        aria-hidden="true"
        className="relative hidden min-h-screen overflow-hidden border-l border-border lg:block"
        style={background_style(background)}
      >
        {hasBackgroundImage && background.overlay.opacity > 0 ? (
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: background.overlay.color,
              opacity: background.overlay.opacity,
            }}
          />
        ) : null}

        {siteHost ? (
          <div className="absolute inset-x-0 bottom-0 flex justify-end p-8">
            <span className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground">
              {siteHost}
            </span>
          </div>
        ) : null}
      </aside>
    </main>
  );
}
