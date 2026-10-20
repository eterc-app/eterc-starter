"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTgUi } from "@/engine/ui/TgUiProvider";

type Errors = Record<string, string[]>;

const STEP_TITLES = ["Welcome", "Database", "Administrator", "Finalize", "Finish"];

interface SetupWizardProps {
  dbFile: string;
  appPath: string;
}

/**
 * Setup wizard â€” the port of modules/setup (views: setup, database_config,
 * admin_account, update_default_module, setup_complete).
 *
 * The PHP original swapped `.setup-container` over MX requests; here a single
 * client component drives the five steps through the JSON API
 * (`/api/xhr/setup/*`), keeping identical markup and copy.
 */
export function SetupWizard({ dbFile, appPath }: SetupWizardProps) {
  const { csrfToken } = useTgUi();
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
          body: JSON.stringify({ ...payload, csrf_token: csrfToken }),
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
    [csrfToken]
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

  if (helpOpen) {
    return (
      <div className="setup-container">
        <HelpMessage onBack={() => setHelpOpen(false)} />
      </div>
    );
  }

  return (
    <>
      {step === 4 ? <ConfettiCanvas /> : null}
      <div className="setup-container">
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
      </div>
      {busy ? (
        <span className="loading-spinner" aria-hidden="true" />
      ) : null}
    </>
  );
}

/* â”€â”€ Steps indicator (port of setup/draw_steps_indicator) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function StepsIndicator({ current }: { current: number }) {
  return (
    <div className="steps">
      {STEP_TITLES.map((title, index) => (
        <div
          key={title}
          className={index <= current ? "step active" : "step"}
        >
          <span className="step-number">{index + 1}</span>
          <span className="step-title">{title}</span>
        </div>
      ))}
    </div>
  );
}

function HelpLink({ onClick }: { onClick: () => void }) {
  return (
    <div className="help-link">
      <a
        href="#"
        onClick={(event) => {
          event.preventDefault();
          onClick();
        }}
      >
        Need help?
      </a>
    </div>
  );
}

/* â”€â”€ Step 1: Welcome (view: setup.php) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <>
      <h1 className="text-center">Welcome to Your New Eterc Application</h1>
      <p className="text-center mt-1">
        This wizard will guide you through the initial setup of your
        application.
      </p>
      <StepsIndicator current={0} />
      <button type="button" className="btn btn-primary" onClick={onNext}>
        Get Started
      </button>
    </>
  );
}

/* â”€â”€ Step 2: Database (view: database_config.php) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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
    <>
      <h1 className="text-center">Database Connection Test</h1>
      <StepsIndicator current={1} />
      <p className="text-center">
        This port runs on SQLite (managed through Prisma). There are no
        credentials to enter â€” the database file is created automatically.
      </p>
      {notice ? (
        <div className="alert alert-error">
          <p>{notice}</p>
        </div>
      ) : null}
      <label htmlFor="database-file">Database file</label>
      <input
        type="text"
        id="database-file"
        value={dbFile}
        readOnly
        onClick={(event) => (event.target as HTMLInputElement).select()}
      />
      <p className="note mt-1">
        The database file is created automatically upon completion of the next
        step.
      </p>
      <div className="config-summary">
        <div className="config-row">
          <span className="config-key">Engine</span>
          <span className="config-val">SQLite 3 (via better-sqlite3)</span>
        </div>
        <div className="config-row">
          <span className="config-key">ORM / Migrations</span>
          <span className="config-val">Prisma</span>
        </div>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={onNext}
      >
        Test Connection &amp; Continue
      </button>
    </>
  );
}

/* â”€â”€ Step 3: Admin account (view: admin_account.php) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function FieldErrors({ field, errors }: { field: string; errors: Errors }) {
  const messages = errors[field];
  if (!messages || messages.length === 0) return null;
  return (
    <ul className="validation-errors">
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
    <>
      <h1 className="text-center">Create Admin Account</h1>
      <form className="highlight-errors" onSubmit={onSubmit}>
        <p className="text-center">Set up your administrator account.</p>
        <StepsIndicator current={2} />

        <label htmlFor="username">Username</label>
        <FieldErrors field="username" errors={errors} />
        <input
          type="text"
          id="username"
          name="username"
          placeholder="Enter username here"
          autoComplete="username"
          required
        />

        <label htmlFor="email">Email Address</label>
        <FieldErrors field="email" errors={errors} />
        <input
          type="email"
          id="email"
          name="email"
          placeholder="Enter email address here"
          autoComplete="email"
          required
        />

        <label htmlFor="password">Password (min. 8 characters)</label>
        <FieldErrors field="password" errors={errors} />
        <input
          type="password"
          id="password"
          name="password"
          placeholder="Enter password here"
          autoComplete="new-password"
          required
        />

        <label htmlFor="confirm_password">Confirm Password</label>
        <FieldErrors field="confirm_password" errors={errors} />
        <input
          type="password"
          id="confirm_password"
          name="confirm_password"
          placeholder="Confirm your password"
          autoComplete="new-password"
          required
        />

        <button type="submit" className="btn btn-primary" disabled={busy}>
          Create Admin Account
        </button>
      </form>
    </>
  );
}

/* â”€â”€ Step 4: Finalize (view: update_default_module.php) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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
    <>
      <h1 className="text-center">Finalize Setup</h1>
      <p className="text-center">Please review your configuration.</p>
      <StepsIndicator current={3} />
      {notice ? (
        <div className="alert alert-error">
          <p>{notice}</p>
        </div>
      ) : null}
      <div className="config-summary">
        <div className="config-header">Your Configuration</div>
        <div className="config-row">
          <span className="config-key">Default module</span>
          <span className="config-val">
            setup (this wizard skips itself once installed)
          </span>
        </div>
        <div className="config-row">
          <span className="config-key">Database</span>
          <span className="config-val">{dbFile}</span>
        </div>
        <div className="config-row">
          <span className="config-key">Administrator</span>
          <span className="config-val">{adminUsername}</span>
        </div>
      </div>
      <div className="instructions">
        <p>
          <strong>1.</strong> Click the button below to complete the
          installation.
        </p>
        <p className="mt-2">
          <strong>2.</strong> After that, you&apos;ll be taken to your
          homepage.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={onNext}
      >
        Verify &amp; Continue
      </button>
    </>
  );
}

/* â”€â”€ Step 5: Complete (view: setup_complete.php) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function CompleteStep({ appPath }: { appPath: string }) {
  return (
    <>
      <h1 className="text-center mb-1">Congratulations!</h1>
      <StepsIndicator current={4} />
      <p className="text-center mt-1">You are ready to rock.</p>
      <div className="instructions">
        <p>
          <strong>1.</strong> Optionally, delete the{" "}
          <code style={{ display: "inline" }}>setup</code> module folder.
          You&apos;ll find it here:
        </p>
        <div className="long-path">
          <code>{`${appPath}\\src\\modules\\setup`}</code>
        </div>
        <p className="mt-2">
          <strong>2.</strong> After that, click the button below to go to your
          homepage.
        </p>
      </div>
      <div className="text-center mt-2">
        <a href="/" className="button btn btn-primary">
          Go to Your Homepage
        </a>{" "}
        <a
          href="/trongate_administrators/manage"
          className="button btn btn-primary"
        >
          Go to Admin Panel
        </a>
      </div>
    </>
  );
}

/* â”€â”€ Help message (view: help_message.php) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export function HelpMessage({ onBack }: { onBack: () => void }) {
  return (
    <>
      <h1>A Message From Dave Connelly</h1>
      <p className="mt-1">
        In the world of PHP frameworks, nothing is more disheartening than when
        someone begins their journey but fails with the initial setup. When
        that happens, everyone loses â€” the users walk away disappointed (having
        wasted their time) and the framework makers miss out on an opportunity
        to share their work.
      </p>
      <p>
        So, here&apos;s the promise this port keeps: nobody should have to
        abandon the framework because they can&apos;t get past the installation
        phase. If you&apos;re stuck, don&apos;t worry! Email{" "}
        <strong>dave@trongate.io</strong> and get help personally.
      </p>
      <p>You have my word.</p>
      <p>Dave Connelly (founder)</p>
      <div className="text-center mt-2">
        <button type="button" className="button btn btn-primary" onClick={onBack}>
          &larr; Back to Setup
        </button>
      </div>
    </>
  );
}

/* â”€â”€ Confetti (port of setup.js startConfetti) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}
    />
  );
}

