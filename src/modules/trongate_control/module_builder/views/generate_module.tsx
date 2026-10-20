"use client";

import { Button } from "@/components/ui/button";

/**
 * Generation success — port of module_builder/views/generate_module.php.
 */
export function GenerateModuleStep({
  onView,
  onOkay,
}: {
  onView: () => void;
  onOkay: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h2>Module Successfully Created</h2>
      <Button type="button" onClick={onView}>
        View Your Module
      </Button>
      <div>
        <Button type="button" variant="outline" onClick={onOkay}>
          Okay
        </Button>
      </div>
    </div>
  );
}
