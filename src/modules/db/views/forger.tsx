import { EtForm } from "@/engine/ui/EtForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import type { EtViewProps } from "@/engine/views-registry";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

export default function Forger({ data }: EtViewProps) {
  const table = String(data.table ?? "");
  const update_id = Number(data.update_id ?? 0);
  const fields = (data.fields ?? []) as FormField[];

  return (
    <div className="app-page max-w-3xl">
      <PageHeader
        eyebrow="Database"
        title={update_id > 0 ? "Edit record" : "New record"}
        description={
          update_id > 0
            ? `Edit record #${update_id} in ${table}.`
            : `Create a new record in ${table}.`
        }
      />

      <ValidationErrors />

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>Record details</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <EtForm
            action="db/submit_forge"
            params={[table, update_id]}
            className="space-y-5"
          >
            {fields.map((field) => (
              <div key={field.name} className="space-y-3">
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

            <div className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row">
              <Button type="submit" name="submit" value="Submit">
                Save record
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
