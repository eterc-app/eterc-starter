import type { TgViewProps } from "@/engine/views-registry";
import { PropertiesBuilder } from "../PropertiesBuilder";

/**
 * Properties Builder page — port of
 * modules/trongate_control/properties_builder/views/home.php.
 *
 * The original was a standalone HTML document. The port mounts the React
 * builder inside the Eterc shell with a Tailwind layout.
 */

export default function PropertiesBuilderHome({ data }: TgViewProps) {
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
