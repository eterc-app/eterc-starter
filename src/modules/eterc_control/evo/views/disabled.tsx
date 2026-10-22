import type { EtViewProps } from "@/engine/views-registry";
export default function EvoDisabled(_props: EtViewProps) {
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
