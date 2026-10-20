import { ENV, ETERC_HOME_URL, ETERC_DOCS_URL } from "@/engine/config";

/**
 * Default homepage — port of modules/welcome/views/default_homepage.php.
 */
export default function DefaultHomepage() {
  return (
    <>
      <h1 className="mt-2">Enjoy Eterc!</h1>
      <h2>The Next.js Framework</h2>
      <p className="mt-2">
        You have successfully installed Eterc. You&apos;re now ready to start
        building fast, efficient web applications.
      </p>

      <div className="mt-3">
        {ENV === "dev" ? (
          <a className="button" href="/trongate_administrators/manage">
            Admin Panel
          </a>
        ) : (
          <a className="button" href={ETERC_HOME_URL} target="_blank" rel="noreferrer">
            Visit Eterc
          </a>
        )}{" "}
        <a className="button alt" href={ETERC_DOCS_URL} target="_blank" rel="noreferrer">
          View Documentation
        </a>
      </div>
    </>
  );
}
