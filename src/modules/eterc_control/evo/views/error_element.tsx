import type { EtViewProps } from "@/engine/views-registry";
import { ResetButton } from "./ResetButton";
export default function EvoErrorElement({ data, message }: EtViewProps) {
  const text = String(message ?? data?.message ?? "");

  return (
    <div>
      <div className="error">{text}</div>
      <div className="mt-0">
        <ResetButton label="Okay" />
      </div>
    </div>
  );
}

export { EvoErrorElement };
