import { TgForm } from "@/engine/ui/TgForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import type { TgViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Password update form — port of
 * modules/trongate_administrators/views/update_password.php.
 */
export default function UpdatePassword({ data }: TgViewProps) {
  const update_id = Number(data.update_id ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1>{String(data.headline ?? "")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a new password for this administrator.
        </p>
      </div>

      <ValidationErrors />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Update Password</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <TgForm
            action="trongate_administrators/submit_update_password"
            params={[update_id]}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                name="password"
                defaultValue=""
                placeholder="Enter New Password"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm Password</Label>
              <Input
                id="confirm_password"
                type="password"
                name="confirm_password"
                defaultValue=""
                placeholder="Confirm New Password"
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <Button type="submit" name="submit" value="Update Password">
                Update Password
              </Button>
              <Button asChild variant="outline">
                <a href={String(data.cancel_url ?? "")}>Cancel</a>
              </Button>
            </div>
          </TgForm>
        </CardContent>
      </Card>
    </div>
  );
}
