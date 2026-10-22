import type { EtViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import { ResetButton } from "./ResetButton";
export default function EvoGenerationError({
  data,
  message,
  more_info_url,
}: EtViewProps) {
  const text = String(message ?? data?.message ?? "");
  const moreInfoUrl = String(
    more_info_url ?? data?.more_info_url ?? ""
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <p
        className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
        role="alert"
      >
        {text}
      </p>
      {moreInfoUrl !== "" ? (
        <Button asChild variant="outline">
          <a href={moreInfoUrl} target="_blank" rel="noreferrer">
            Learn More About This Error
          </a>
        </Button>
      ) : null}
      <div>
        <ResetButton label="Okay" />
      </div>
    </div>
  );
}

export { EvoGenerationError };
