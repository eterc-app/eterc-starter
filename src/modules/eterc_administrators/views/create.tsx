import { EtForm } from "@/engine/ui/EtForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import type { EtViewProps } from "@/engine/views-registry";
import { PageActions } from "@/components/app/PageActions";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound } from "lucide-react";

export default function Create({ data }: EtViewProps) {
  const update_id = Number(data.update_id ?? 0);
  const is_update = data.id !== undefined && data.id !== null;

  return (
    <div className="app-page max-w-3xl">
      <PageHeader
        eyebrow="Content"
        title={is_update ? "Update administrator" : "Create administrator"}
        description="Set the account username and whether it can sign in."
        actions={
          is_update ? (
            <PageActions
              items={[
                {
                  label: "Update password",
                  icon: <KeyRound className="size-4" />,
                  href: String(data.update_password_url ?? ""),
                },
              ]}
            />
          ) : null
        }
      />

      <ValidationErrors />

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>Account details</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
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
                autoComplete="off"
              />
            </div>

            <label className="flex h-10 items-center gap-3 rounded-lg border border-input bg-card px-3 text-sm">
              <input
                type="checkbox"
                name="active"
                value="1"
                defaultChecked={Number(data.active ?? 0) === 1}
                className="m-0 size-5 accent-foreground"
              />
              <span className="font-semibold">Active</span>
            </label>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <Button type="submit" name="submit" value="Submit">
                {is_update ? "Save administrator" : "Create administrator"}
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
