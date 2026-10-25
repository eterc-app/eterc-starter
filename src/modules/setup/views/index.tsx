import type { EtViewProps } from "@/engine/views-registry";
import { SetupWizard, HelpMessage } from "../SetupWizard";

function SetupIndex({ data }: EtViewProps) {
  return (
    <main>
      <SetupWizard
        dbFile={String(data.dbFile ?? "")}
        appPath={String(data.appPath ?? "")}
      />
    </main>
  );
}

function SetupHelpMessage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-card p-6 shadow-none sm:p-8">
        <HelpMessage onBack={() => undefined} />
      </div>
    </main>
  );
}

export const views = {
  "setup/index": SetupIndex,
  "setup/help_message": SetupHelpMessage,
};
