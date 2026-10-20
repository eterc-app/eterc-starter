import { TgForm } from "@/engine/ui/TgForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * The forger — create/edit record form for one table.
 *
 * Rendered by DbAdmin::forger() / buildForgerViewData(); designed from the
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
    <>
      <h1>{String(data.headline ?? "")}</h1>
      <ValidationErrors />

      <div className="card">
        <div className="card-heading">Record Details</div>
        <div className="card-body">
          <TgForm action="db/submit_forge" params={[table, update_id]}>
            {fields.map((field) => (
              <div key={field.name}>
                <label htmlFor={`field-${field.name}`}>
                  {field.label}
                  {field.required ? " *" : ""}
                </label>

                {!field.submit ? (
                  <input
                    id={`field-${field.name}`}
                    type="text"
                    defaultValue={field.value}
                    readOnly
                    disabled
                  />
                ) : field.input_type === "textarea" ? (
                  <textarea
                    id={`field-${field.name}`}
                    name={field.name}
                    defaultValue={field.value}
                    placeholder={field.placeholder}
                    required={field.required}
                  />
                ) : (
                  <input
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

            <div className="text-center">
              <a className="button alt" href={String(data.cancel_url ?? "")}>
                Cancel
              </a>
              <button type="submit" name="submit" value="Submit">
                Submit
              </button>
            </div>
          </TgForm>
        </div>
      </div>
    </>
  );
}
