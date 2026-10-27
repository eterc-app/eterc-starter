"use client";

import { useCallback, useState } from "react";
import NextImage from "next/image";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEtUi } from "@/engine/ui/EtUiProvider";
import { ETERC_DOCS_URL, ETERC_FORUM_URL } from "@/engine/config";
import { Notice } from "@/components/app/Notice";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Errors = Record<string, string[]>;

const STEP_TITLES = ["Welcome", "Database", "Administrator", "Finalize", "Finish"];

interface SetupWizardProps {
  dbFile: string;
  appPath: string;
}
export function SetupWizard({ dbFile, appPath }: SetupWizardProps) {
  const { csrf_token } = useEtUi();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");

  const call = useCallback(
    async (method: string, payload: Record<string, unknown> = {}) => {
      setBusy(true);
      setNotice("");
      setErrors({});
      try {
        const response = await fetch(`/api/xhr/setup/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, csrf_token: csrf_token }),
        });
        const json = (await response.json()) as {
          status: string;
          data?: Record<string, unknown>;
          message?: string;
        };
        if (json.status !== "ok") {
          setNotice(json.message ?? "The request could not be completed.");
          return null;
        }
        return json.data ?? {};
      } catch {
        setNotice("A network error occurred. Please try again.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [csrf_token],
  );

  const initDatabase = async () => {
    const data = await call("init_database");
    if (!data) return;
    if (data.ok) {
      setStep(2);
    } else {
      setNotice(String(data.message ?? "Database initialization failed."));
    }
  };

  const createAdmin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      username: String(form.get("username") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      confirm_password: String(form.get("confirm_password") ?? ""),
    };
    const data = await call("create_admin", payload);
    if (!data) return;
    if (data.ok) {
      setAdminUsername(String(data.username ?? payload.username));
      setStep(3);
    } else if (data.errors) {
      setErrors(data.errors as Errors);
    }
  };

  const finalize = async () => {
    const data = await call("finalize", { username: adminUsername });
    if (!data) return;
    if (data.ok) {
      setStep(4);
    } else {
      setNotice("Setup could not be finalized. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Card className="border-border shadow-none">
          <CardContent className="p-6 sm:p-8">
            {helpOpen ? (
              <HelpMessage onBack={() => setHelpOpen(false)} />
            ) : (
              <>
                {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
                {step === 1 && (
                  <DatabaseStep
                    dbFile={dbFile}
                    notice={notice}
                    busy={busy}
                    onNext={initDatabase}
                  />
                )}
                {step === 2 && (
                  <AdminStep errors={errors} busy={busy} onSubmit={createAdmin} />
                )}
                {step === 3 && (
                  <FinalizeStep
                    dbFile={dbFile}
                    adminUsername={adminUsername}
                    notice={notice}
                    busy={busy}
                    onNext={finalize}
                  />
                )}
                {step === 4 && <CompleteStep appPath={appPath} />}
                <HelpLink onClick={() => setHelpOpen(true)} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {busy ? (
        <span
          className="fixed bottom-6 right-6 size-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

/* -- Steps indicator ------------------------------------------------------- */

function StepsIndicator({ current }: { current: number }) {
  return (
    <div className="my-6 grid grid-cols-5 gap-1 sm:gap-2">
      {STEP_TITLES.map((title, index) => {
        const active = index <= current;
        return (
          <div
            key={title}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center transition-colors",
              active
                ? "border-foreground bg-muted text-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-xs font-semibold",
                active
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
            <span className="text-xs font-medium leading-tight">
              {title}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HelpLink({ onClick }: { onClick: () => void }) {
  return (
    <div className="mt-6 text-center">
      <Button variant="link" onClick={onClick}>
        Need help?
      </Button>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2 text-center">
        <NextImage
          src="/company-logo.png"
          alt="Eterc"
          width={56}
          height={56}
          className="mx-auto size-14 rounded-lg border border-border object-cover"
          priority
        />
        <h1 className="type-title">
          Welcome to your new Eterc application
        </h1>
        <p className="text-muted-foreground">
          This wizard will guide you through the initial setup of your
          application.
        </p>
      </div>
      <StepsIndicator current={0} />
      <div className="text-center">
        <Button type="button" size="lg" onClick={onNext}>
          Get started
        </Button>
      </div>
    </div>
  );
}

function DatabaseStep({
  dbFile,
  notice,
  busy,
  onNext,
}: {
  dbFile: string;
  notice: string;
  busy: boolean;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2 text-center">
        <h1 className="type-title">
          Database connection test
        </h1>
        <p className="text-muted-foreground">
          Eterc runs on SQLite (managed through Prisma). There are no
          credentials to enter - the database file is created automatically.
        </p>
      </div>
      <StepsIndicator current={1} />
      {notice ? (
        <Notice icon={AlertTriangle} tone="destructive">
          {notice}
        </Notice>
      ) : null}

      <div className="space-y-3">
        <Label htmlFor="database-file">Database file</Label>
        <Input
          type="text"
          id="database-file"
          value={dbFile}
          readOnly
          onClick={(event) => (event.target as HTMLInputElement).select()}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          The database file is created automatically upon completion of the next
          step.
        </p>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border">
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Engine</span>
          <span className="font-medium">SQLite 3 (via better-sqlite3)</span>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span className="text-muted-foreground">ORM / Migrations</span>
          <span className="font-medium">Prisma</span>
        </div>
      </div>

      <div className="text-center">
        <Button type="button" disabled={busy} onClick={onNext}>
          Test connection &amp; continue
        </Button>
      </div>
    </div>
  );
}

function FieldErrors({ field, errors }: { field: string; errors: Errors }) {
  const messages = errors[field];
  if (!messages || messages.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm text-destructive">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

function AdminStep({
  errors,
  busy,
  onSubmit,
}: {
  errors: Errors;
  busy: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2 text-center">
        <h1 className="type-title">Create administrator account</h1>
        <p className="text-muted-foreground">Set up your administrator account.</p>
      </div>
      <StepsIndicator current={2} />

      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="space-y-3">
          <Label htmlFor="username">Username</Label>
          <Input
            type="text"
            id="username"
            name="username"
            autoComplete="username"
            required
          />
          <FieldErrors field="username" errors={errors} />
        </div>

        <div className="space-y-3">
          <Label htmlFor="email">Email address</Label>
          <Input
            type="email"
            id="email"
            name="email"
            autoComplete="email"
            required
          />
          <FieldErrors field="email" errors={errors} />
        </div>

        <div className="space-y-3">
          <Label htmlFor="password">Password</Label>
          <Input
            type="password"
            id="password"
            name="password"
            autoComplete="new-password"
            required
          />
          <p className="type-note">Use at least 8 characters.</p>
          <FieldErrors field="password" errors={errors} />
        </div>

        <div className="space-y-3">
          <Label htmlFor="confirm_password">Confirm password</Label>
          <Input
            type="password"
            id="confirm_password"
            name="confirm_password"
            autoComplete="new-password"
            required
          />
          <FieldErrors field="confirm_password" errors={errors} />
        </div>

        <div className="text-center">
          <Button type="submit" disabled={busy}>
            Create administrator
          </Button>
        </div>
      </form>
    </div>
  );
}

function FinalizeStep({
  dbFile,
  adminUsername,
  notice,
  busy,
  onNext,
}: {
  dbFile: string;
  adminUsername: string;
  notice: string;
  busy: boolean;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2 text-center">
        <h1 className="type-title">Finalize setup</h1>
        <p className="text-muted-foreground">Please review your configuration.</p>
      </div>
      <StepsIndicator current={3} />
      {notice ? (
        <Notice icon={AlertTriangle} tone="destructive">
          {notice}
        </Notice>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-surface-subtle px-4 py-3 text-sm font-semibold">
          Your configuration
        </div>
        <div className="divide-y divide-border">
          <div className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Default module</span>
            <span className="font-mono text-xs">setup</span>
          </div>
          <div className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Database</span>
            <span className="break-all text-right font-mono text-xs">{dbFile}</span>
          </div>
          <div className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Administrator</span>
            <span className="font-medium">{adminUsername}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg bg-surface-subtle p-4 text-sm">
        <p>
          <span className="font-semibold">1.</span> Click the button below to
          complete the installation.
        </p>
        <p>
          <span className="font-semibold">2.</span> Then open your homepage or
          admin panel.
        </p>
      </div>

      <div className="text-center">
        <Button type="button" disabled={busy} onClick={onNext}>
          Verify &amp; continue
        </Button>
      </div>
    </div>
  );
}

function CompleteStep({ appPath }: { appPath: string }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-foreground">
          <CheckCircle2 className="size-5" strokeWidth={1.75} />
        </span>
        <h1 className="type-title">Setup complete</h1>
        <p className="text-muted-foreground">Your Eterc application is ready.</p>
      </div>
      <StepsIndicator current={4} />

      <div className="space-y-3 rounded-lg bg-surface-subtle p-4 text-sm">
        <p>
          <span className="font-semibold">1.</span> Optionally, delete the{" "}
          <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">
            setup
          </code>{" "}
          module folder. You&apos;ll find it here:
        </p>
        <div className="rounded-lg border border-border bg-card p-3">
          <code className="break-all font-mono text-xs">{`${appPath}\\src\\modules\\setup`}</code>
        </div>
        <p>
          <span className="font-semibold">2.</span> Then open your homepage or
          admin panel.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <a href="/">Go to homepage</a>
        </Button>
        <Button asChild variant="outline">
          <a href="/administrators/manage">Go to admin panel</a>
        </Button>
      </div>
    </div>
  );
}

export function HelpMessage({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <CardHeader className="px-0 pt-0">
        <CardTitle>A message from the Eterc team</CardTitle>
        <CardDescription>
          Nobody should have to abandon a framework because setup got in the way.
        </CardDescription>
      </CardHeader>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Nothing is more disheartening than starting a new project and getting
        stuck during initial setup. When that happens, everyone loses: users
        walk away disappointed, and framework authors miss the opportunity to
        share their work.
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        So here is the promise Eterc keeps: if you are stuck, the documentation
        and community forum are one click away.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <a href={ETERC_DOCS_URL} target="_blank" rel="noreferrer">
            Read the documentation
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={ETERC_FORUM_URL} target="_blank" rel="noreferrer">
            Ask the community
          </a>
        </Button>
      </div>
      <p className="text-sm font-medium">You have our word.</p>
      <p className="text-sm text-muted-foreground">The Eterc Team</p>

      <div className="text-center">
        <Button type="button" variant="outline" onClick={onBack}>
          &larr; Back to setup
        </Button>
      </div>
    </div>
  );
}
