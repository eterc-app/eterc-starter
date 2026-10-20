import { TgForm } from "@/engine/ui/TgForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * Password update form — port of
 * modules/trongate_administrators/views/update_password.php.
 */
export default function UpdatePassword({ data }: TgViewProps) {
  const update_id = Number(data.update_id ?? 0);

  return (
    <>
      <h1>{String(data.headline ?? "")}</h1>
      <ValidationErrors />
      <div className="card">
        <div className="card-heading">Update Password</div>
        <div className="card-body">
          <TgForm
            action="trongate_administrators/submit_update_password"
            params={[update_id]}
          >
            <label>New Password</label>
            <input
              type="password"
              name="password"
              defaultValue=""
              placeholder="Enter New Password"
              autoComplete="off"
            />

            <label>Confirm Password</label>
            <input
              type="password"
              name="confirm_password"
              defaultValue=""
              placeholder="Confirm New Password"
              autoComplete="off"
            />

            <div className="text-center">
              <a className="button alt" href={String(data.cancel_url ?? "")}>
                Cancel
              </a>
              <button type="submit" name="submit" value="Update Password">
                Update Password
              </button>
            </div>
          </TgForm>
        </div>
      </div>
    </>
  );
}
