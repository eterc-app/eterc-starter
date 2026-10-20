import type { TgViewProps } from "@/engine/views-registry";

/**
 * Disabled response — port of evo/views/disabled.php.
 */
export default function EvoDisabled(_props: TgViewProps) {
  return (
    <div className="container">
      <h1>Feature Disabled</h1>
      <p>
        This feature is only available when the application is running in
        development mode.
      </p>
    </div>
  );
}

export { EvoDisabled };
