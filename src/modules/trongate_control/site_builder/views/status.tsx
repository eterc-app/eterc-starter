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
    <div className="container">
      <h1>Site Builder</h1>

      <p>
        The Site Builder generates a complete CRUD module from a module name,
        labels and a list of properties. It is normally driven by the{" "}
        <a href="/trongate_control-module-builder">Module Builder</a> wizard.
      </p>

      <h2>Generated artifacts</h2>
      <p>
        Modules are written to{" "}
        <code>{generatedModulesDir ?? "src/modules/generated"}</code>. Each
        generated module contains:
      </p>
      <ul>
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

      <h2 id="troubleshooting">Troubleshooting</h2>

      <h3 id="troubleshooting-module-already-exists">
        Module Already Exists
      </h3>
      <p>
        A directory with the same name already exists under the modules or
        generated-modules directory. Choose a different module name or remove
        the old module.
      </p>

      <h3 id="troubleshooting-table-already-exists">
        Database Table Already Exists
      </h3>
      <p>
        The SQLite database already contains a table with the module name.
        Choose a different name or drop the existing table first.
      </p>

      <h3 id="troubleshooting-file-permissions">Permissions Error</h3>
      <p>
        The generator could not write to the modules directory (or the
        navigation settings directory). Check the filesystem permissions of the
        application user.
      </p>

      <h3 id="troubleshooting-sql-execution">SQL Execution Error</h3>
      <p>
        The module files were generated but the schema could not be applied.
        The one-shot <code>.sql</code> file was kept so it can be run manually.
      </p>

      <h3 id="troubleshooting-nav-links">Navigation links</h3>
      <p>
        Navigation links are recorded in{" "}
        <code>{navLinksPath ?? "data/settings/site_builder/nav_links.json"}</code>
        . The React admin template does not read this file yet, so links must
        be added to the control-panel menu by hand.
      </p>
    </div>
  );
}

export default SiteBuilderStatus;
