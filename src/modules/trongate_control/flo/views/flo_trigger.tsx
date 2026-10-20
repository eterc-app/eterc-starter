import type { TgViewProps } from "@/engine/views-registry";
import { FloTrigger } from "../FloTrigger";

/**
 * Trigger view — keeps the PHP view name (`flo_trigger`) addressable while
 * reusing the shared React launcher component.
 */
export default function FloTriggerView(_props: TgViewProps) {
  return <FloTrigger />;
}
