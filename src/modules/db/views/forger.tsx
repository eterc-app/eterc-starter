import { TgForm } from "@/engine/ui/TgForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import type { TgViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The forger — create/edit record form for one table.
 *
 * Rendered by Db::forger() / buildForgerViewData(); designed from the
 * data contract (no PHP original view exists):
 *
 *   headline, table, update_id, fields (FormField[]), primary_key, cancel_url
 *
 * Non-submittable fields (the primary key) render read-only; everything else
 * is a text, number or textarea input. Submitting posts to db/submit_forge
 * through <TgForm>, so validation failures re-render this same view inside the
 * form subtree while showing the errors.
 */

interface FormField {
  name: string;
  label: string;
  input_type: "text" | "number" | "textarea";
  step: string;
  value: string;
  placeholder: string;
  required: boolean;
  submit: boolean;
}

export default function Forger({ data }: TgViewProps) {
  const table = String(data.table ?? "");
  const update_id = Number(data.update_id ?? 0);
  const fields = (data.fields ?? []) as FormField[];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {update_id > 0
            ? `Edit record #${update_id} in ${table}.`
            : `Create a new record in ${table}.`}
        </p>
      </div>

      <ValidationErrors />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Record Details</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <TgForm
            action="db/submit_forge"
            params={[table, update_id]}
            className="space-y-5"
          >
            {fields.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={`field-${field.name}`}>
                  {field.label}
                  {field.required ? " *" : ""}
                </Label>

                {!field.submit ? (
                  <Input
                    id={`field-${field.name}`}
                    type="text"
                    defaultValue={field.value}
                    readOnly
                    disabled
                  />
                ) : field.input_type === "textarea" ? (
                  <Textarea
                    id={`field-${field.name}`}
                    name={field.name}
                    defaultValue={field.value}
                    placeholder={field.placeholder}
                    required={field.required}
                  />
                ) : (
                  <Input
                    id={`field-${field.name}`}
                    type={field.input_type}
                    name={field.name}
                    step={field.step || undefined}
                    defaultValue={field.value}
                    placeholder={field.placeholder}
                    required={field.required}
                    autoComplete="off"
                  />
                )}
              </div>
            ))}

            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
              <Button type="submit" name="submit" value="Submit">
                Submit
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
