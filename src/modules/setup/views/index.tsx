import type { TgViewProps } from "@/engine/views-registry";
import { SetupWizard, HelpMessage } from "../SetupWizard";

/**
 * Setup module views — registration map for the React port.
 *
 * PHP originals: setup.php, database_config.php, admin_account.php,
 * update_default_module.php, setup_complete.php, help_message.php.
 * The five wizard steps live inside <SetupWizard /> (a client component);
 * this module keeps the {module}/{view_file} addressing intact.
 */

function SetupIndex({ data }: TgViewProps) {
  return (
    <>
      <link rel="stylesheet" href="/setup_module/css/setup.css" />
      <SetupWizard
        dbFile={String(data.dbFile ?? "")}
        appPath={String(data.appPath ?? "")}
      />
    </>
  );
}

function SetupHelpMessage() {
  return (
    <div className="setup-container">
      <link rel="stylesheet" href="/setup_module/css/setup.css" />
      <HelpMessage onBack={() => undefined} />
    </div>
  );
}

export const views = {
  "setup/index": SetupIndex,
  "setup/help_message": SetupHelpMessage,
};
