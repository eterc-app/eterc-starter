"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function AddNavLabelStep({
  recordNamePlural,
  onSubmit,
  busy,
  error,
}: {
  recordNamePlural: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h2>Add Navigation Label</h2>
      <form
        action="#"
        id="enter-nav-label-form"
        className="space-y-3"
        onSubmit={onSubmit}
      >
        <div className="space-y-2">
          <Label htmlFor="nav-label-input">Navigation label</Label>
          <Input
            id="nav-label-input"
            type="text"
            name="nav_label"
            defaultValue={`Manage ${recordNamePlural}`}
            autoComplete="off"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy}>
          Submit
        </Button>
        <p className="text-sm text-muted-foreground">
          Submit an empty value if a navigation label is not required.
        </p>
      </form>
    </div>
  );
}
