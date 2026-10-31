import { EtForm } from "@/engine/ui/EtForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import type { EtViewProps } from "@/engine/views-registry";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function UpdatePassword({ data }: EtViewProps) {
  const update_id = Number(data.update_id ?? 0);

  return (
    <div className="app-page max-w-3xl">
      <PageHeader
        eyebrow="Content"
        title="Update password"
        description="Choose a new password for this administrator."
      />

      <ValidationErrors />

      <div className="space-y-4">
        <div className="border-b border-border pb-3">
          <h2 className="text-base font-semibold text-foreground">Update password</h2>
        </div>
        <div>
          <EtForm
            action="eterc_administrators/submit_update_password"
            params={[update_id]}
            className="space-y-5"
          >
            <div className="grid gap-3">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                name="password"
                defaultValue=""
                autoComplete="new-password"
              />
              <p className="type-note">Use at least 12 characters.</p>
            </div>

            <div className="grid gap-3">
              <Label htmlFor="confirm_password">Confirm password</Label>
              <Input
                id="confirm_password"
                type="password"
                name="confirm_password"
                defaultValue=""
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <Button type="submit" name="submit" value="Update Password">
                Update password
              </Button>
              <Button asChild variant="outline">
                <a href={String(data.cancel_url ?? "")}>Cancel</a>
              </Button>
            </div>
          </EtForm>
        </div>
      </div>
    </div>
  );
}
