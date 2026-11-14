import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { activeAiProvider } from "@/engine/active/ai-provider";
import { activeAuthProvider } from "@/engine/active/auth-provider";
import { activeCacheProvider } from "@/engine/active/cache-provider";
import { activeDbAdapter } from "@/engine/active/db-adapter";
import { activeEmailProvider } from "@/engine/active/email-provider";
import { activePaymentProvider } from "@/engine/active/payment-provider";
import { activeQueueProvider } from "@/engine/active/queue-provider";
import { activeSmsProvider } from "@/engine/active/sms-provider";
import { activeStorageProvider } from "@/engine/active/storage-provider";
import { activeTelegramProvider } from "@/engine/active/telegram-provider";
import { activeWhatsAppProvider } from "@/engine/active/whatsapp-provider";
import { orm } from "@/engine/db/client";

export async function GET() {
  const checks = await Promise.all([
    activeDbAdapter.ping().then((ok) => ({
      name: "database",
      ok,
      message: ok ? "SQLite responded." : "SQLite did not respond.",
    })),
    Promise.resolve()
      .then(() => {
        const row = orm.get(sql`select 1 as ok`) as { ok?: number } | undefined;
        return {
          name: "orm",
          ok: row?.ok === 1,
          message: row?.ok === 1 ? "Drizzle ORM responded." : "Drizzle ORM did not respond.",
        };
      })
      .catch((error: unknown) => ({
        name: "orm",
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      })),
    (activeAuthProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "auth", ...check }),
    ),
    (activeStorageProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "storage", ...check }),
    ),
    (activeCacheProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "cache", ...check }),
    ),
    (activeQueueProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "jobs", ...check }),
    ),
    (activeEmailProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "email", ...check }),
    ),
    (activeSmsProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "sms", ...check }),
    ),
    (activeWhatsAppProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "whatsapp", ...check }),
    ),
    (activeTelegramProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "telegram", ...check }),
    ),
    (activePaymentProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "payments", ...check }),
    ),
    (activeAiProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "ai", ...check }),
    ),
  ]);

  const ok = checks.every((check) => check.ok);
  return NextResponse.json(
    {
      ok,
      service: "eterc",
      stack: {
        orm: "drizzle",
        auth: activeAuthProvider.id,
        database: activeDbAdapter.dialect,
        cache: activeCacheProvider.id,
        jobs: activeQueueProvider.id,
        storage: activeStorageProvider.id,
        email: activeEmailProvider.id,
        sms: activeSmsProvider.id,
        whatsapp: activeWhatsAppProvider.id,
        telegram: activeTelegramProvider.id,
        payments: activePaymentProvider.id,
        ai: activeAiProvider.id,
      },
      checks,
      checkedAt: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
