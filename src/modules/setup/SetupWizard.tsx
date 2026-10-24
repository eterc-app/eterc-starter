"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import { useEtUi } from "@/engine/ui/EtUiProvider";
import { ETERC_DOCS_URL, ETERC_FORUM_URL } from "@/engine/config";
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
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      {step === 4 ? <ConfettiCanvas /> : null}

      <div className="mx-auto w-full max-w-3xl">
        <Card className="shadow-none border-border/70">
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
              "flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-center transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-xs font-bold",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
            <span className="text-[10px] font-medium leading-tight sm:text-xs">
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

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      {children}
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
          className="mx-auto size-14 rounded-xl object-cover"
          priority
        />
        <h1 className="text-lg font-semibold tracking-[-0.01em] sm:text-xl">
          Welcome to Your New Eterc Application
        </h1>
        <p className="text-muted-foreground">
          This wizard will guide you through the initial setup of your
          application.
        </p>
      </div>
      <StepsIndicator current={0} />
      <div className="text-center">
        <Button type="button" size="lg" onClick={onNext}>
          Get Started
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
        <h1 className="text-lg font-semibold tracking-[-0.01em]">
          Database Connection Test
        </h1>
        <p className="text-muted-foreground">
          Eterc runs on SQLite (managed through Prisma). There are no
          credentials to enter - the database file is created automatically.
        </p>
      </div>
      <StepsIndicator current={1} />
      {notice ? <Notice>{notice}</Notice> : null}

      <div className="space-y-2">
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

      <div className="divide-y rounded-lg border">
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
          Test Connection &amp; Continue
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
        <h1 className="text-lg font-semibold tracking-[-0.01em]">Create Admin Account</h1>
        <p className="text-muted-foreground">Set up your administrator account.</p>
      </div>
      <StepsIndicator current={2} />

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <FieldErrors field="username" errors={errors} />
          <Input
            type="text"
            id="username"
            name="username"
            placeholder="Enter username here"
            autoComplete="username"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <FieldErrors field="email" errors={errors} />
          <Input
            type="email"
            id="email"
            name="email"
            placeholder="Enter email address here"
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password (min. 8 characters)</Label>
          <FieldErrors field="password" errors={errors} />
          <Input
            type="password"
            id="password"
            name="password"
            placeholder="Enter password here"
            autoComplete="new-password"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm_password">Confirm Password</Label>
          <FieldErrors field="confirm_password" errors={errors} />
          <Input
            type="password"
            id="confirm_password"
            name="confirm_password"
            placeholder="Confirm your password"
            autoComplete="new-password"
            required
          />
        </div>

        <div className="text-center">
          <Button type="submit" disabled={busy}>
            Create Admin Account
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
        <h1 className="text-lg font-semibold tracking-[-0.01em]">Finalize Setup</h1>
        <p className="text-muted-foreground">Please review your configuration.</p>
      </div>
      <StepsIndicator current={3} />
      {notice ? <Notice>{notice}</Notice> : null}

      <div className="overflow-hidden rounded-lg border">
        <div className="bg-muted/60 px-4 py-2 text-sm font-semibold">
          Your Configuration
        </div>
        <div className="divide-y">
          <div className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Default module</span>
            <span className="text-right font-medium">
              setup (this wizard skips itself once installed)
            </span>
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

      <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
        <p>
          <strong>1.</strong> Click the button below to complete the
          installation.
        </p>
        <p>
          <strong>2.</strong> After that, you&apos;ll be taken to your homepage.
        </p>
      </div>

      <div className="text-center">
        <Button type="button" disabled={busy} onClick={onNext}>
          Verify &amp; Continue
        </Button>
      </div>
    </div>
  );
}

function CompleteStep({ appPath }: { appPath: string }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2 text-center">
        <h1 className="text-lg font-semibold tracking-[-0.01em]">Congratulations!</h1>
        <p className="text-muted-foreground">You are ready to rock.</p>
      </div>
      <StepsIndicator current={4} />

      <div className="space-y-3 rounded-lg bg-muted/50 p-4 text-sm">
        <p>
          <strong>1.</strong> Optionally, delete the{" "}
          <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">
            setup
          </code>{" "}
          module folder. You&apos;ll find it here:
        </p>
        <div className="rounded-md border bg-background p-2">
          <code className="break-all font-mono text-xs">{`${appPath}\\src\\modules\\setup`}</code>
        </div>
        <p>
          <strong>2.</strong> After that, click the button below to go to your
          homepage.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <a href="/">Go to Your Homepage</a>
        </Button>
        <Button asChild variant="outline">
          <a href="/administrators/manage">Go to Admin Panel</a>
        </Button>
      </div>
    </div>
  );
}

export function HelpMessage({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-base">A Message From the Eterc Team</CardTitle>
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
          &larr; Back to Setup
        </Button>
      </div>
    </div>
  );
}

/* -- Confetti -------------------------------------------------------------- */

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const colors = [
      "#e74c3c",
      "#f1c40f",
      "#2ecc71",
      "#3498db",
      "#9b59b6",
      "#e67e22",
    ];
    const pieces = Array.from({ length: 160 }, () => ({
      x: width / 2 + (Math.random() - 0.5) * 120,
      y: height / 2 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4,
      size: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
    }));

    const startedAt = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      ctx.clearRect(0, 0, width, height);
      let alive = false;
      for (const piece of pieces) {
        piece.vy += 0.35;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.rotation += piece.spin;
        if (piece.y < height + 30) alive = true;
        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rotation);
        ctx.fillStyle = piece.color;
        ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
        ctx.restore();
      }
      if (alive && elapsed < 4) {
        raf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      id="confetti-canvas"
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[9999]"
    />
  );
}
