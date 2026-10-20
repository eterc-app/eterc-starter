import type { TgViewProps } from "@/engine/views-registry";
import { ResetButton } from "./ResetButton";

/**
 * Generation error — port of evo/views/generation_error.php.
 */
export default function EvoGenerationError({
  data,
  message,
  more_info_url,
}: TgViewProps) {
  const text = String(message ?? data?.message ?? "");
  const moreInfoUrl = String(
    more_info_url ?? data?.more_info_url ?? ""
  );

  return (
    <div>
      <p className="error-msg">{text}</p>
      {moreInfoUrl !== "" ? (
        <div className="mt-0">
          <a
            className="button learn-more"
            href={moreInfoUrl}
            target="_blank"
            rel="noreferrer"
          >
            Learn More About This Error
          </a>
        </div>
      ) : null}
      <div className="mt-1">
        <ResetButton label="Okay" />
      </div>
    </div>
  );
}

export { EvoGenerationError };
