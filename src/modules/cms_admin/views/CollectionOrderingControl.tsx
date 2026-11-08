"use client";

import { useId } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  CmsCollectionOrderingMode,
  CmsCollectionSort,
} from "@/modules/cms/cms-types";

export interface CollectionOrderingField {
  name: string;
  label: string;
}

interface CollectionOrderingControlProps {
  mode: CmsCollectionOrderingMode;
  defaultOrder: CmsCollectionSort[];
  fields: CollectionOrderingField[];
  hasManualSort: boolean;
  onModeChange: (mode: CmsCollectionOrderingMode) => void;
  onDefaultOrderChange: (order: CmsCollectionSort[]) => void;
}

export function CollectionOrderingControl({
  mode,
  defaultOrder,
  fields,
  hasManualSort,
  onModeChange,
  onDefaultOrderChange,
}: CollectionOrderingControlProps) {
  const modeId = useId();
  const selectableFields = [
    ...fields,
    ...defaultOrder
      .filter((rule) => !fields.some((field) => field.name === rule.field))
      .map((rule) => ({ name: rule.field, label: `${rule.field} (unavailable)` })),
  ];
  const unavailableFields = defaultOrder.filter(
    (rule) => !fields.some((field) => field.name === rule.field)
  );

  const updateRule = (index: number, patch: Partial<CmsCollectionSort>) => {
    onDefaultOrderChange(
      defaultOrder.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      )
    );
  };

  const moveRule = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= defaultOrder.length) return;
    const next = [...defaultOrder];
    [next[index], next[target]] = [next[target], next[index]];
    onDefaultOrderChange(next);
  };

  const addRule = () => {
    const available = fields.find(
      (field) => !defaultOrder.some((rule) => rule.field === field.name)
    );
    if (!available) return;
    onDefaultOrderChange([
      ...defaultOrder,
      { field: available.name, direction: "asc" },
    ]);
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <label
          htmlFor={modeId}
          className="text-xs font-semibold text-muted-foreground"
        >
          Ordering mode
        </label>
        <select
          id={modeId}
          value={mode}
          onChange={(event) =>
            onModeChange(event.target.value as CmsCollectionOrderingMode)
          }
          className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground"
        >
          <option value="default" disabled={hasManualSort}>
            Collection default
          </option>
          <option value="manual" disabled={!hasManualSort}>
            Manual order (Sort field)
          </option>
          <option value="fields" disabled={fields.length === 0 && mode !== "fields"}>
            Order by fields
          </option>
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        {mode === "manual"
          ? "Content can be reordered manually. The Sort field controls the list order."
          : mode === "fields"
            ? "Records use these fields in order. Manual drag-and-drop is disabled until you switch back to manual order."
            : "Uses the collection's existing default order. Saved field ordering is kept if you switch modes."}
      </p>

      {mode === "fields" ? (
        <div className="grid gap-2">
          {defaultOrder.map((rule, index) => (
            <div
              key={`${rule.field}-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_110px_auto] items-center gap-2"
            >
              <select
                aria-label={`Ordering field ${index + 1}`}
                value={rule.field}
                onChange={(event) =>
                  updateRule(index, { field: event.target.value })
                }
                className="h-9 min-w-0 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
              >
                {selectableFields.map((field) => (
                  <option
                    key={field.name}
                    value={field.name}
                    disabled={
                      field.name !== rule.field &&
                      defaultOrder.some((item) => item.field === field.name)
                    }
                  >
                    {field.label}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Ordering direction ${index + 1}`}
                value={rule.direction}
                onChange={(event) =>
                  updateRule(index, {
                    direction: event.target.value as "asc" | "desc",
                  })
                }
                className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Move ordering field ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => moveRule(index, -1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Move ordering field ${index + 1} down`}
                  disabled={index === defaultOrder.length - 1}
                  onClick={() => moveRule(index, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove ordering field ${index + 1}`}
                  onClick={() =>
                    onDefaultOrderChange(
                      defaultOrder.filter((_, ruleIndex) => ruleIndex !== index)
                    )
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={!fields.some(
              (field) => !defaultOrder.some((rule) => rule.field === field.name)
            )}
            onClick={addRule}
          >
            <Plus className="size-3.5" />
            Add sort field
          </Button>
          {defaultOrder.length === 0 ? (
            <p className="text-xs text-destructive">
              Add at least one field before saving this ordering mode.
            </p>
          ) : null}
          {unavailableFields.length > 0 ? (
            <p className="text-xs text-destructive">
              Replace or remove unavailable fields before saving.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
