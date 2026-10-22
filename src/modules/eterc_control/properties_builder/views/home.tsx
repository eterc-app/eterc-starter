import type { EtViewProps } from "@/engine/views-registry";
import { PropertiesBuilder } from "../PropertiesBuilder";

export default function PropertiesBuilderHome({ data }: EtViewProps) {
  const apiBase =
    typeof data.api_base === "string" && data.api_base !== ""
      ? data.api_base
      : "/api/xhr";

  return (
    <div className="mx-auto min-h-[60vh] w-full max-w-6xl p-4 sm:p-6">
      <PropertiesBuilder apiBase={apiBase} />
    </div>
  );
}
