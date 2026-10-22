import { EtForm } from "@/engine/ui/EtForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import type { EtViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export default function Create({ data }: EtViewProps) {
  const update_id = Number(data.update_id ?? 0);
  const is_update = data.id !== undefined && data.id !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1>{String(data.headline ?? "")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set the account username and whether it can sign in.
        </p>
      </div>

      <ValidationErrors />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Record Details</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {is_update ? (
            <div className="mb-5 flex justify-end">
              <Button asChild variant="outline" size="sm">
                <a href={String(data.update_password_url ?? "")}>
                  Update Password
                </a>
              </Button>
            </div>
          ) : null}

          <EtForm
            action="eterc_administrators/submit"
            params={[update_id]}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                name="username"
                defaultValue={String(data.username ?? "")}
                placeholder="Enter Username"
                autoComplete="off"
              />
            </div>

            <Label className="flex items-center gap-2 font-normal">
              <input
                type="checkbox"
                name="active"
                value="1"
                defaultChecked={Number(data.active ?? 0) === 1}
                className="m-0 size-4 rounded border-input"
              />
              Active
            </Label>

            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <Button type="submit" name="submit" value="Submit">
                Submit
              </Button>
              <Button asChild variant="outline">
                <a href={String(data.cancel_url ?? "")}>Cancel</a>
              </Button>
            </div>
          </EtForm>
        </CardContent>
      </Card>
    </div>
  );
}
