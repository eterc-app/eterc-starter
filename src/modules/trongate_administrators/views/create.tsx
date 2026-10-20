import { TgForm } from "@/engine/ui/TgForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * Create/update administrator form — port of
 * modules/trongate_administrators/views/create.php.
 */
export default function Create({ data }: TgViewProps) {
  const update_id = Number(data.update_id ?? 0);
  const is_update = data.id !== undefined && data.id !== null;

  return (
    <>
      <h1>{String(data.headline ?? "")}</h1>
      <ValidationErrors />
      <div className="card">
        <div className="card-heading">Record Details</div>
        <div className="card-body">
          {is_update ? (
            <p className="text-right">
              <a
                className="button alt mt-0"
                href={String(data.update_password_url ?? "")}
              >
                Update Password
              </a>
            </p>
          ) : null}

          <TgForm action="trongate_administrators/submit" params={[update_id]}>
            <label>Username</label>
            <input
              type="text"
              name="username"
              defaultValue={String(data.username ?? "")}
              placeholder="Enter Username"
              autoComplete="off"
            />

            <label>
              <input
                type="checkbox"
                name="active"
                value="1"
                defaultChecked={Number(data.active ?? 0) === 1}
              />{" "}
              Active
            </label>

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
