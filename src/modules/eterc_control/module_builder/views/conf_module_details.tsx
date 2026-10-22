"use client";

import { useState, type FormEvent } from "react";
import { useEtUi } from "@/engine/ui/EtUiProvider";
import type { EtViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Editable module details — port of
 * module_builder/views/conf_module_details.php.
 *
 * The PHP view seeded form values from localStorage through flo.js and posted
 * with `mx-post`; the React port receives the wizard values as props, posts
 * the form to the JSON API and reproduces the `afterValidation` behaviour:
 *   - success: postMessage('reload_iframe:<url>|<width>|<height>')
 *   - failure: render the validation errors in the form.
 */

interface DetailsWizard {
  module_folder_name?: string;
  record_name_singular?: string;
  record_name_plural?: string;
  nav_label?: string;
  properties?: unknown;
  url_column?: string;
  order_by?: string;
}

type Errors = Record<string, string[]>;

const selectClass =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

export default function ConfModuleDetails({ data }: EtViewProps) {
  const { csrf_token } = useEtUi();

  const wizard = (data.wizard ?? {}) as DetailsWizard;
  const urlColumnOptions = (data.url_column_options ?? {
    "": "-- No URL Column --",
  }) as Record<string, string>;
  const orderByOptions = (data.order_by_options ?? {
    id: "id",
    "id DESC": "id DESC",
  }) as Record<string, string>;

  const afterCloseUrl = String(
    data.after_close_url ??
      "/control/module-builder/conf_generate_mod?template=c64"
  );
  const afterCloseWidth = String(data.after_close_width ?? 800);
  const afterCloseHeight = String(data.after_close_height ?? 600);

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");

  const closeWindow = () => {
    window.parent.postMessage(
      `reload_iframe:${afterCloseUrl}|${afterCloseWidth}|${afterCloseHeight}`,
      "*"
    );
    // When the page is not running inside the Flo iframe shell there is no
    // parent listener; navigate to the same destination instead.
    if (typeof window !== "undefined" && window.parent === window) {
      window.location.href = afterCloseUrl;
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setNotice("");

    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = {
      moduleDir: String(form.get("moduleDir") ?? ""),
      recordNameSingular: String(form.get("recordNameSingular") ?? ""),
      recordNamePlural: String(form.get("recordNamePlural") ?? ""),
      navLabel: String(form.get("navLabel") ?? ""),
      properties: String(form.get("properties") ?? ""),
      urlColumn: String(form.get("urlColumn") ?? ""),
      orderBy: String(form.get("orderBy") ?? ""),
      csrf_token: csrf_token,
    };

    try {
      const response = await fetch(
        "/api/xhr/eterc_control-module_builder/submit_mod_details",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const envelope = (await response.json()) as {
        status?: string;
        data?: { ok?: boolean; errors?: Errors };
        errors?: Errors;
        message?: string;
        redirect?: string;
      };

      if (envelope.status === "redirect") {
        window.location.href = envelope.redirect ?? "/";
        return;
      }

      if (envelope.status === "error") {
        setNotice(envelope.message ?? "The details could not be saved.");
        return;
      }

      const result = envelope.data ?? {};
      if (result.ok === true) {
        closeWindow();
        return;
      }

      const resultErrors = result.errors ?? envelope.errors;
      if (resultErrors && Object.keys(resultErrors).length > 0) {
        setErrors(resultErrors);
      } else {
        setNotice("The details could not be saved.");
      }
    } catch {
      setNotice("A network error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const fieldErrors = (field: string) => {
    const messages = errors[field];
    if (!messages || messages.length === 0) return null;
    return (
      <ul className="space-y-1 text-sm text-destructive">
        {messages.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ul>
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div>
        <h1>Module Details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Adjust the generated module&apos;s names, route settings and
          properties before generating it.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form action="#" className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="moduleDir-input">Module Directory</Label>
                {fieldErrors("moduleDir")}
                <Input
                  type="text"
                  name="moduleDir"
                  id="moduleDir-input"
                  autoComplete="off"
                  defaultValue={wizard.module_folder_name ?? ""}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="recordNameSingular-input">
                  Record Name Singular
                </Label>
                {fieldErrors("recordNameSingular")}
                <Input
                  type="text"
                  name="recordNameSingular"
                  id="recordNameSingular-input"
                  autoComplete="off"
                  defaultValue={wizard.record_name_singular ?? ""}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recordNamePlural-input">
                  Record Name Plural
                </Label>
                {fieldErrors("recordNamePlural")}
                <Input
                  type="text"
                  name="recordNamePlural"
                  id="recordNamePlural-input"
                  autoComplete="off"
                  defaultValue={wizard.record_name_plural ?? ""}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="navLabel-input">Nav Label</Label>
                {fieldErrors("navLabel")}
                <Input
                  type="text"
                  name="navLabel"
                  id="navLabel-input"
                  autoComplete="off"
                  defaultValue={wizard.nav_label ?? ""}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="properties-input">Properties</Label>
              {fieldErrors("properties")}
              <Textarea
                name="properties"
                id="properties-input"
                rows={12}
                className="min-h-48 font-mono text-sm"
                defaultValue={JSON.stringify(wizard.properties ?? [], null, 2)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="urlColumn-input">URL Column</Label>
                {fieldErrors("urlColumn")}
                <select
                  name="urlColumn"
                  id="urlColumn-input"
                  className={selectClass}
                  defaultValue={wizard.url_column ?? ""}
                >
                  {Object.entries(urlColumnOptions).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="orderBy-input">Order By</Label>
                {fieldErrors("orderBy")}
                <select
                  name="orderBy"
                  id="orderBy-input"
                  className={selectClass}
                  defaultValue={wizard.order_by || "id"}
                >
                  {Object.entries(orderByOptions).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {notice ? (
              <p className="text-sm font-medium text-destructive">{notice}</p>
            ) : null}

            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
              <Button type="button" variant="outline" onClick={closeWindow}>
                Close Window
              </Button>
              <Button type="submit" disabled={busy}>
                Update Details
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
