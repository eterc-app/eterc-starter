"use client";

import { useState, type ReactNode } from "react";
import type { TgViewProps } from "@/engine/views-registry";
import type { ControlPanelLink, SqlFileInfo } from "../types";

/**
 * Main view for the trongate_control parent module.
 *
 * PHP original: modules/trongate_control/views/main.php + the standalone
 * transferer.js/transferer.css assets. That page is a bare document holding
 * the SQL import wizard's headline (#headline) and display area (#info);
 * transferer.js drives its screens with XMLHttpRequest calls to
 * BASE_URL + 'trongate_control/process'.
 *
 * Port notes:
 *  - the original view is a standalone HTML document; the port renders
 *    inside the admin theme and drives the identical wizard screens with
 *    React state + fetch() against the JSON API endpoint (data.api_url);
 *  - the AJAX transport wraps controller output in
 *    {status, data, errors, flash, http}; `http` is the equivalent of the
 *    PHP http_response_code() and `data` is the echoed body;
 *  - this module's PHP parent has no dashboard. The port shows a
 *    control-panel dashboard linking to the child modules whenever no module
 *    import is pending (port-only; see Trongate_control.ts).
 */

/** The wizard's display states (mirrors transferer.js update_display calls). */
type WizardScreen =
  | "list"
  | "reading"
  | "displaying"
  | "too_big"
  | "confirm_delete"
  | "confirm_run"
  | "please_wait"
  | "finished"
  | "error"
  | "run_delete_required";

export default function Main({ data }: TgViewProps) {
  const files = (data.files ?? []) as SqlFileInfo[];

  if (files.length > 0) {
    return <ImportWizard data={data} />;
  }

  return <Dashboard data={data} />;
}

// ---------------------------------------------------------------------------
// Dashboard (port-only)
// ---------------------------------------------------------------------------

function Dashboard({ data }: TgViewProps) {
  const links = (data.links ?? []) as ControlPanelLink[];
  const node_version = String(data.node_version ?? "");
  const env = String(data.env ?? "");

  return (
    <>
      <h1>Eterc Control Panel</h1>
      <p>Development tools and code generators for the Eterc framework.</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "1em",
          margin: "2em 0",
          textAlign: "left",
        }}
      >
        {links.map((link) => (
          <div className="card" key={link.href}>
            <div className="card-heading">{link.label}</div>
            <div className="card-body">
              <p style={{ lineHeight: "1.6" }}>{link.description}</p>
              <a className="button" href={link.href}>
                Open
              </a>
            </div>
          </div>
        ))}
      </div>

      <p style={{ color: "#666" }}>
        Eterc &middot; Node.js {node_version} &middot; {env}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// SQL import wizard (PHP: main.php + transferer.js)
// ---------------------------------------------------------------------------

function ImportWizard({ data }: TgViewProps) {
  const files = (data.files ?? []) as SqlFileInfo[];
  const current_url = String(data.current_url ?? "");
  const api_url = String(data.api_url ?? "");

  // transferer.js state management.
  const [screen, setScreen] = useState<WizardScreen>("list");
  const [target_file, setTargetFile] = useState("");
  const [sql_code, setSqlCode] = useState("");
  const [preview_visible, setPreviewVisible] = useState(true);
  const [wait_message, setWaitMessage] = useState("");
  const [finished_message, setFinishedMessage] = useState("");
  const [error_title, setErrorTitle] = useState("SQL ERROR");
  const [error_message, setErrorMessage] = useState("");
  const [too_big_filename, setTooBigFilename] = useState("");

  /**
   * send_request() - POST JSON to the process endpoint and normalise the
   * JSON API envelope back into {response, status} (the callback arguments
   * of the original XMLHttpRequest code).
   */
  const send_request = async (
    params: Record<string, unknown>
  ): Promise<{ response: string; status: number }> => {
    let res: Response;

    try {
      res = await fetch(api_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
    } catch (error) {
      return { response: String(error), status: 0 };
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = (await res.json()) as Record<string, unknown>;
    } catch {
      payload = {};
    }

    if (payload.status === "redirect") {
      // Session expired / user not allowed - follow the framework redirect.
      window.location.assign(String(payload.redirect ?? ""));
      return { response: "", status: 0 };
    }

    if (payload.status === "error") {
      return { response: String(payload.message ?? ""), status: res.status };
    }

    return {
      response:
        payload.data === null || payload.data === undefined
          ? ""
          : String(payload.data),
      status: Number(payload.http ?? res.status),
    };
  };

  /** view_sql() - read a SQL file and move to the preview screen. */
  const view_sql = async (file: string, has_warning: boolean) => {
    setScreen("reading");

    const { response, status } = await send_request({
      controllerPath: file,
      action: "viewSql",
    });

    const sql = status < 400 && status !== 0 ? response : "";

    setSqlCode(sql);
    setTargetFile(file);
    setPreviewVisible(true);
    setScreen("displaying");

    if (has_warning === true) {
      window.alert(
        "Eterc detected some potentially dangerous code embedded within this SQL file. Be extra careful!"
      );
    }
  };

  /** explain_too_big() - file exceeds the maximum size. */
  const explain_too_big = (filename: string, filepath: string) => {
    setTargetFile(filepath);
    setTooBigFilename(filename);
    setScreen("too_big");
  };

  /** draw_confirm_delete() - confirm deleting the current file. */
  const draw_confirm_delete = () => {
    setScreen("confirm_delete");
  };

  /** draw_confirm_run() - confirm running the current SQL. */
  const draw_confirm_run = () => {
    setPreviewVisible(false);
    setScreen("confirm_run");
  };

  /** preview_sql() - re-show the SQL preview from the confirm screen. */
  const preview_sql = () => {
    setPreviewVisible(true);
  };

  /** show_error() - render an error response with the raw text. */
  const show_error = (message: string, title: string) => {
    setErrorTitle(title);
    setErrorMessage(message);
    setScreen("error");
  };

  /** run_sql() - execute the SQL and delete its source file. */
  const run_sql = async () => {
    setWaitMessage("Executing SQL...");
    setScreen("please_wait");

    const { response, status } = await send_request({
      sqlCode: sql_code,
      action: "runSql",
      targetFile: target_file,
    });

    if (status === 403) {
      // The SQL ran but the file could not be deleted; the PHP response was
      // "Finished." + the file path.
      const filepath = response.replace("Finished.", "") || target_file;
      setErrorMessage(filepath);
      setScreen("run_delete_required");
    } else if (response === "Finished.") {
      setFinishedMessage("The SQL file was successfully processed.");
      setScreen("finished");
    } else {
      show_error(response, "SQL ERROR");
    }
  };

  /** delete_sql_file() - delete the current target file. */
  const delete_sql_file = async () => {
    setWaitMessage("Deleting SQL...");
    setScreen("please_wait");

    const { response, status } = await send_request({
      targetFile: target_file,
      action: "deleteFile",
    });

    if (response === "Finished.") {
      setFinishedMessage("The SQL file was successfully deleted.");
      setScreen("finished");
    } else {
      // PHP: the model answered 403 with the file path as the body.
      show_error(status === 403 ? target_file : response, "Delete Error");
    }
  };

  /** click_okay() - reload or leave the wizard once all SQL files are done. */
  const click_okay = async () => {
    const { response } = await send_request({ action: "checkFinish" });

    if (response === "reload") {
      window.location.reload();
    } else {
      window.location.assign(response);
    }
  };

  /** update_display() - the headline for each screen. */
  const renderHeadline = (): ReactNode => {
    switch (screen) {
      case "list":
        return "SQL Files Found";
      case "reading":
        return "Reading SQL";
      case "displaying":
        return "Displaying SQL";
      case "too_big":
        return "SQL File Is Too Big!";
      case "confirm_delete":
        return <span className="danger">DELETE FILE</span>;
      case "confirm_run":
        return "RUN SQL";
      case "please_wait":
        return "PLEASE WAIT";
      case "finished":
      case "run_delete_required":
        return "Finished";
      case "error":
        return <span className="danger">{error_title}</span>;
    }
  };

  /** update_display() - the #info contents for each screen. */
  const renderInfo = (): ReactNode => {
    switch (screen) {
      case "list":
        return (
          <>
            <p>
              {files.length === 1
                ? "The following SQL file was found within the module directory:"
                : "The following SQL files were found within the module directory:"}
            </p>
            <ul>
              {files.map((file) => (
                <li key={file.path}>
                  * {file.filename} ({file.filesize_kb} KB)
                  {file.too_big ? (
                    <button
                      className="danger"
                      onClick={() => explain_too_big(file.filename, file.path)}
                    >
                      TOO BIG!
                    </button>
                  ) : file.safe ? (
                    <button onClick={() => void view_sql(file.path, false)}>
                      VIEW SQL
                    </button>
                  ) : (
                    <button
                      className="warning"
                      onClick={() => void view_sql(file.path, true)}
                    >
                      SUSPICIOUS!
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        );

      case "reading":
        return null;

      case "displaying":
        return (
          <>
            <p>The contents of the SQL file is displayed below:</p>
            <p>
              <a href={current_url}>
                <button>Go Back</button>
              </a>
              <button className="success" onClick={draw_confirm_run}>
                Run SQL
              </button>
              <button className="danger" onClick={draw_confirm_delete}>
                Delete File
              </button>
            </p>
            <div>
              <textarea
                id="sql-preview"
                style={PREVIEW_STYLE}
                value={sql_code}
                onChange={(event) => setSqlCode(event.target.value)}
              />
            </div>
          </>
        );

      case "too_big":
        return (
          <>
            <p>The file, {too_big_filename}, is too big.</p>
            <p>
              For automatic database setup, Eterc has filesize limit of 1MB
              (1,000kb).
            </p>
            <button className="danger" onClick={() => void delete_sql_file()}>
              Delete File
            </button>
            <a href={current_url}>
              <button>Go Back</button>
            </a>
          </>
        );

      case "confirm_delete":
        return (
          <>
            <p>You are about to delete an SQL file.</p>
            <p>Location: {target_file}</p>
            <p>Are you sure?</p>
            <button className="danger" onClick={() => void delete_sql_file()}>
              Delete File
            </button>{" "}
            <a href={current_url}>
              <button>Cancel</button>
            </a>
          </>
        );

      case "confirm_run":
        return (
          <>
            <p>You are about to run the SQL file.</p>
            <p>Location: {target_file}</p>
            <p>Are you sure?</p>
            <button className="success" onClick={() => void run_sql()}>
              I Understand The Risks - Execute the SQL
            </button>{" "}
            <button onClick={preview_sql}>Preview SQL</button>{" "}
            <a href={current_url}>
              <button>Cancel</button>
            </a>
            <div>
              <textarea
                id="sql-preview"
                disabled
                style={
                  preview_visible
                    ? PREVIEW_STYLE
                    : { ...PREVIEW_STYLE, display: "none" }
                }
                value={sql_code}
              />
            </div>
          </>
        );

      case "please_wait":
        return <p className="blink">{wait_message}</p>;

      case "finished":
        return (
          <>
            <p>{finished_message}</p>
            <p>
              <button className="success" onClick={() => void click_okay()}>
                Okay
              </button>
            </p>
          </>
        );

      case "run_delete_required":
        return (
          <>
            <p>Please delete the file, {error_message}.</p>
            <p>After you have deleted the file, press &apos;Okay&apos;</p>
            <p>
              <button className="success" onClick={() => void click_okay()}>
                Okay
              </button>
            </p>
          </>
        );

      case "error":
        return (
          <>
            <p>Oh dear, there appears to be an error.</p>
            <p>
              <a href={current_url}>
                <button>Go Back</button>
              </a>
            </p>
            <p>The following response was generated:</p>
            <p>
              <textarea
                id="error-msg"
                readOnly
                style={ERROR_STYLE}
                value={error_message}
              />
            </p>
          </>
        );
    }
  };

  return (
    <>
      <h1 id="headline">{renderHeadline()}</h1>
      <div id="info">{renderInfo()}</div>
    </>
  );
}

/**
 * transferer.css textarea rules, applied inline because the original
 * standalone stylesheet is a full-page document stylesheet and the port
 * renders inside the admin theme.
 */
const PREVIEW_STYLE = {
  width: "80%",
  height: "50vh",
  fontSize: ".9em",
  display: "block",
  margin: "0 auto",
} as const;

const ERROR_STYLE = {
  ...PREVIEW_STYLE,
  height: "30vh",
  backgroundColor: "#ffe9e8",
} as const;
