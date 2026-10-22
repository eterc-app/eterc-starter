import type { EtViewProps } from "@/engine/views-registry";
import { SetupWizard, HelpMessage } from "../SetupWizard";

/**
 * Setup module views - registration map for the React port.
 *
 * PHP originals: setup.php, database_config.php, admin_account.php,
 * update_default_module.php, setup_complete.php, help_message.php.
 * The five wizard steps live inside <SetupWizard /> (a client component);
 * this module keeps the {module}/{view_file} addressing intact.
 */

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
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-lg border border-border/70 bg-card p-6 shadow-none sm:p-8">
        <HelpMessage onBack={() => undefined} />
      </div>
    </main>
  );
}

export const views = {
  "setup/index": SetupIndex,
  "setup/help_message": SetupHelpMessage,
};
