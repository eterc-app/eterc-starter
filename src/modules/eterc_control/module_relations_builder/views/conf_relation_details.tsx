"use client";

import { useState, type FormEvent } from "react";
import { useEtUi } from "@/engine/ui/EtUiProvider";
import type { EtViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RelationsWizard } from "../types";

type Errors = Record<string, string[]>;

function ucwords(value: string): string {
  return value
    .split(" ")
    .map((word) =>
      word === "" ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

const API_ROOT = "/api/xhr/eterc_control-module_relations_builder";

export default function ConfRelationDetails({ data }: EtViewProps) {
  const { csrf_token } = useEtUi();

  const wizard = (data.wizard ?? {}) as RelationsWizard;
  const afterCloseUrl = String(
    data.after_close_url ??
      "/control/module-relations-builder/conf_generate_relation?template=c64"
  );
  const afterCloseWidth = String(data.after_close_width ?? 800);
  const afterCloseHeight = String(data.after_close_height ?? 600);

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");

  const summaryRows: Array<[string, string]> = [
    ["Relation Type", ucwords(String(wizard.relation_type ?? ""))],
    [
      "Module A",
      `${wizard.parent_module ?? ""} (${wizard.singular_a ?? ""})`,
    ],
    [
      "Module B",
      `${wizard.child_module ?? ""} (${wizard.singular_b ?? ""})`,
    ],
    ["Bridging Table", wizard.bridging_table ? "Yes" : "No"],
  ];

  const closeWindow = () => {
    window.parent.postMessage(
      `reload_iframe:${afterCloseUrl}|${afterCloseWidth}|${afterCloseHeight}`,
      "*"
    );
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
      identifierColumnA: String(form.get("identifierColumnA") ?? ""),
      identifierColumnB: String(form.get("identifierColumnB") ?? ""),
      csrf_token: csrf_token,
    };

    try {
      const response = await fetch(`${API_ROOT}/submit_relation_details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

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
        <h1>Relation Details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose the identifier columns used to describe each record in
          dropdowns and association panels.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="px-4">Setting</TableHead>
                <TableHead className="px-4">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryRows.map(([label, value]) => (
                <TableRow key={label}>
                  <TableCell className="px-4 font-medium">{label}</TableCell>
                  <TableCell className="px-4">{value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Identifier Columns</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form action="#" className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="identifierColumnA-input">
                  Identifier Column A
                </Label>
                {fieldErrors("identifierColumnA")}
                <Input
                  type="text"
                  name="identifierColumnA"
                  id="identifierColumnA-input"
                  autoComplete="off"
                  defaultValue={wizard.identifier_column_a ?? ""}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="identifierColumnB-input">
                  Identifier Column B
                </Label>
                {fieldErrors("identifierColumnB")}
                <Input
                  type="text"
                  name="identifierColumnB"
                  id="identifierColumnB-input"
                  autoComplete="off"
                  defaultValue={wizard.identifier_column_b ?? ""}
                />
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Identifier columns are used to describe a record in dropdowns and
              association panels. Comma-separated multi-column values are
              allowed.
            </p>

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
