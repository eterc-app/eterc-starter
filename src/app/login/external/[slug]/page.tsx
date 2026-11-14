import NextImage from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { get_public_login_settings } from "@/modules/login/login-settings";
import {
  external_auth_label,
  external_auth_provider,
} from "@/modules/login/external-auth";

export default async function ExternalLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  const provider = external_auth_provider();
  if (!provider) {
    redirect(`/login/login/${encodeURIComponent(slug)}`);
  }

  const settings = get_public_login_settings();
  const brand = settings.brand;
  const label = external_auth_label(provider);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-5">
      <Card className="w-full max-w-[440px] border-border bg-card shadow-none">
        <CardHeader className="justify-items-center text-center">
          <NextImage
            src={brand.logo || "/company-logo.png"}
            alt={`${brand.name} logo`}
            width={44}
            height={44}
            className="mb-2 size-11 rounded-lg border border-border object-cover"
            priority
          />
          <h1 className="text-lg leading-snug font-medium">Welcome back</h1>
          <CardDescription>{brand.name}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Button asChild size="lg">
            <Link
              href={`/api/auth/external/start?level=${encodeURIComponent(slug)}`}
            >
              Continue with {label}
            </Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Your provider email must match an existing active administrator.
          </p>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Eterc CMS · Private by default
      </p>
    </main>
  );
}
