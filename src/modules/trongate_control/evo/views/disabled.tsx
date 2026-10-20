import type { TgViewProps } from "@/engine/views-registry";

/**
 * Disabled response — port of evo/views/disabled.php.
 */
export default function EvoDisabled(_props: TgViewProps) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h1>Feature Disabled</h1>
      <p className="text-sm text-muted-foreground">
        This feature is only available when the application is running in
        development mode.
      </p>
    </div>
  );
}

export { EvoDisabled };
