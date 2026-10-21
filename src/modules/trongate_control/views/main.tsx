"use client";

import { useState, type ReactNode } from "react";
import type { TgViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowUpRight,
  Blocks,
  Cpu,
  Database,
  GitFork,
  Languages,
  PanelsTopLeft,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

const BUILDER_ICONS: Record<string, LucideIcon> = {
  Flo: Sparkles,
  Evo: Terminal,
  "Module Builder": Blocks,
  "Site Builder": PanelsTopLeft,
  "Properties Builder": SlidersHorizontal,
  "Query Builder": Database,
  "Module Relations Builder": GitFork,
  "Image Uploader Builder": Upload,
  "Plural Maker": Languages,
};

function Dashboard({ data }: TgViewProps) {
  const links = (data.links ?? []) as ControlPanelLink[];
  const node_version = String(data.node_version ?? "");
  const env = String(data.env ?? "");
  const environment = env.toLowerCase() === "dev" ? "Development" : "Production";

  const stats = [
    {
      label: "Builders",
      value: String(links.length),
      hint: "Available tools",
      icon: Blocks,
    },
    {
      label: "Environment",
      value: environment,
      hint: "Runtime mode",
      icon: Terminal,
    },
    {
      label: "Runtime",
      value: node_version || "Unknown",
      hint: "Node.js",
      icon: Cpu,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="min-h-[104px] rounded-lg border border-border/70 bg-card p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-4 truncate text-[14px] font-medium tracking-[-0.01em]">
                    {stat.value}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {stat.hint}
                  </p>
                </div>
                <Icon
                  className="size-4 shrink-0 text-muted-foreground/60"
                  strokeWidth={1.75}
                />
              </div>
            </div>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <div className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[13px] font-medium tracking-[-0.01em]">
              Builders
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Generate modules, queries, and site features.
            </p>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {links.length} tools
          </span>
        </div>

        {links.length === 0 ? (
          <p className="px-4 py-6 text-[12px] text-muted-foreground">
            No builders are available.
          </p>
        ) : (
          <div>
            {links.map((link) => {
              const Icon = BUILDER_ICONS[link.label] ?? Blocks;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className="group flex items-center gap-3 border-b border-border/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border/60 bg-muted/30">
                    <Icon
                      className="size-3.5 text-muted-foreground"
                      strokeWidth={1.75}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium leading-4">
                      {link.label}
                    </span>
                    <span
                      className="mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground"
                      title={link.description}
                    >
                      {link.description}
                    </span>
                  </span>
                  <ArrowUpRight
                    className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground"
                    strokeWidth={1.75}
                  />
                </a>
              );
            })}
          </div>
        )}
      </section>
    </div>
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
        return <span className="text-destructive">DELETE FILE</span>;
      case "confirm_run":
        return "RUN SQL";
      case "please_wait":
        return "PLEASE WAIT";
      case "finished":
      case "run_delete_required":
        return "Finished";
      case "error":
        return <span className="text-destructive">{error_title}</span>;
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
            <ul className="mt-4 space-y-3">
              {files.map((file) => (
                <li
                  key={file.path}
                  className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2"
                >
                  <span className="font-mono text-sm">
                    {file.filename} ({file.filesize_kb} KB)
                  </span>
                  {file.too_big ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => explain_too_big(file.filename, file.path)}
                    >
                      TOO BIG!
                    </Button>
                  ) : file.safe ? (
                    <Button size="sm" onClick={() => void view_sql(file.path, false)}>
                      VIEW SQL
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-500 text-amber-700"
                      onClick={() => void view_sql(file.path, true)}
                    >
                      SUSPICIOUS!
                    </Button>
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
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <a href={current_url}>Go Back</a>
              </Button>
              <Button onClick={draw_confirm_run}>Run SQL</Button>
              <Button variant="destructive" onClick={draw_confirm_delete}>
                Delete File
              </Button>
            </div>
            <textarea
              id="sql-preview"
              className="mt-4 block min-h-[50vh] w-full rounded-md border bg-background p-3 font-mono text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={sql_code}
              onChange={(event) => setSqlCode(event.target.value)}
            />
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
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" onClick={() => void delete_sql_file()}>
                Delete File
              </Button>
              <Button asChild variant="outline">
                <a href={current_url}>Go Back</a>
              </Button>
            </div>
          </>
        );

      case "confirm_delete":
        return (
          <>
            <p>You are about to delete an SQL file.</p>
            <p className="font-mono text-sm">Location: {target_file}</p>
            <p>Are you sure?</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" onClick={() => void delete_sql_file()}>
                Delete File
              </Button>
              <Button asChild variant="outline">
                <a href={current_url}>Cancel</a>
              </Button>
            </div>
          </>
        );

      case "confirm_run":
        return (
          <>
            <p>You are about to run the SQL file.</p>
            <p className="font-mono text-sm">Location: {target_file}</p>
            <p>Are you sure?</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void run_sql()}>
                I Understand The Risks - Execute the SQL
              </Button>
              <Button variant="outline" onClick={preview_sql}>
                Preview SQL
              </Button>
              <Button asChild variant="outline">
                <a href={current_url}>Cancel</a>
              </Button>
            </div>
            <textarea
              id="sql-preview"
              disabled
              className={cn(
                "mt-4 block min-h-[50vh] w-full rounded-md border bg-background p-3 font-mono text-sm shadow-xs",
                !preview_visible && "hidden",
              )}
              value={sql_code}
            />
          </>
        );

      case "please_wait":
        return <p className="animate-pulse font-medium">{wait_message}</p>;

      case "finished":
        return (
          <>
            <p>{finished_message}</p>
            <Button onClick={() => void click_okay()}>Okay</Button>
          </>
        );

      case "run_delete_required":
        return (
          <>
            <p>Please delete the file, {error_message}.</p>
            <p>After you have deleted the file, press &apos;Okay&apos;</p>
            <Button onClick={() => void click_okay()}>Okay</Button>
          </>
        );

      case "error":
        return (
          <>
            <p>Oh dear, there appears to be an error.</p>
            <Button asChild variant="outline">
              <a href={current_url}>Go Back</a>
            </Button>
            <p>The following response was generated:</p>
            <textarea
              id="error-msg"
              readOnly
              className="mt-2 block min-h-[30vh] w-full rounded-md border border-destructive/40 bg-destructive/10 p-3 font-mono text-sm"
              value={error_message}
            />
          </>
        );
    }
  };

  return (
    <div className="space-y-6">
      <h1 id="headline" className="text-lg font-semibold tracking-[-0.01em]">
        {renderHeadline()}
      </h1>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div id="info" className="space-y-4">
            {renderInfo()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
