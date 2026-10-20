import { Button } from "@/components/ui/button";

/**
 * Port-only status page for the site_builder child module.
 *
 * The PHP module was a service used by Evo/Flo and had no landing page. The
 * control-panel dashboard links to every child module, so this page explains
 * how the port is wired and where its artifacts live.
 */
export function SiteBuilderStatus({
  generatedModulesDir,
  navLinksPath,
}: {
  generatedModulesDir?: string;
  navLinksPath?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-6">
      <p className="text-sm text-muted-foreground">
        The Site Builder generates a complete CRUD module from a module name,
        labels and a list of properties. It is normally driven by the{" "}
        <a href="/trongate_control-module-builder">Module Builder</a> wizard.
      </p>

      <section className="space-y-2">
        <h2>Generated artifacts</h2>
        <p className="text-sm">
          Modules are written to{" "}
          <code>{generatedModulesDir ?? "src/modules/generated"}</code>. Each
          generated module contains:
        </p>
        <ul className="list-disc space-y-1 pl-6 text-sm">
          <li>
            <code>&lt;Name&gt;.ts</code> — controller
          </li>
          <li>
            <code>&lt;Name&gt;_model.ts</code> — model
          </li>
          <li>
            <code>views/</code> — manage, create, show, delete_conf, not_found
            (+ search_modal)
          </li>
          <li>
            <code>&lt;module&gt;.sql</code> — SQLite schema, removed after a
            successful run
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 id="troubleshooting">Troubleshooting</h2>

        <div className="space-y-1">
          <h3 id="troubleshooting-module-already-exists">
            Module Already Exists
          </h3>
          <p className="text-sm text-muted-foreground">
            A directory with the same name already exists under the modules or
            generated-modules directory. Choose a different module name or
            remove the old module.
          </p>
        </div>

        <div className="space-y-1">
          <h3 id="troubleshooting-table-already-exists">
            Database Table Already Exists
          </h3>
          <p className="text-sm text-muted-foreground">
            The SQLite database already contains a table with the module name.
            Choose a different name or drop the existing table first.
          </p>
        </div>

        <div className="space-y-1">
          <h3 id="troubleshooting-file-permissions">Permissions Error</h3>
          <p className="text-sm text-muted-foreground">
            The generator could not write to the modules directory (or the
            navigation settings directory). Check the filesystem permissions of
            the application user.
          </p>
        </div>

        <div className="space-y-1">
          <h3 id="troubleshooting-sql-execution">SQL Execution Error</h3>
          <p className="text-sm text-muted-foreground">
            The module files were generated but the schema could not be applied.
            The one-shot <code>.sql</code> file was kept so it can be run
            manually.
          </p>
        </div>

        <div className="space-y-1">
          <h3 id="troubleshooting-nav-links">Navigation links</h3>
          <p className="text-sm text-muted-foreground">
            Navigation links are recorded in{" "}
            <code>
              {navLinksPath ?? "data/settings/site_builder/nav_links.json"}
            </code>
            . The React admin template does not read this file yet, so links
            must be added to the control-panel menu by hand.
          </p>
        </div>
      </section>

      <Button asChild variant="outline">
        <a href="/trongate_control">Return to the control panel</a>
      </Button>
    </div>
  );
}

export default SiteBuilderStatus;
