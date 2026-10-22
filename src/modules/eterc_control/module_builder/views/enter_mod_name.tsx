"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Step 1 — port of module_builder/views/enter_mod_name.php.
 * Markup and copy preserved; the form is handled by ModuleBuilderWizard.
 */
export function EnterModNameStep({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h2>Enter Module Name</h2>
      <form
        action="#"
        id="enter-mod-name-form"
        className="space-y-3"
        onSubmit={onSubmit}
      >
        <div className="space-y-2">
          <Label htmlFor="mod-name-input">Module name (singular)</Label>
          <Input
            id="mod-name-input"
            type="text"
            name="mod_name"
            autoComplete="off"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy}>
          Submit
        </Button>
      </form>
    </div>
  );
}
