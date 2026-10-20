"use client";

import type { ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { decode_html_entities } from "./properties-logic";

/**
 * Add-property / add-address modal — port of the `#id01` block in
 * properties_builder/views/home.php and clickLeftBtn/clickAddressBtn/
 * autocomplete() from properties_builder.js.
 */

const ADDRESS_PLACEHOLDER = "Select Address Type...";

export interface AddPropertyModalProps {
  mode: "none" | "property" | "address";
  headline: string;
  instructions: ReactNode;
  title: string;
  suggestions: string[];
  onTitleChange: (value: string) => void;
  onAddProperty: () => void;
  addressTypes: string[];
  addressType: string;
  addressLoading: boolean;
  onAddressTypeChange: (value: string) => void;
  onAddAddress: () => void;
  onClose: () => void;
  titleInputRef: RefObject<HTMLInputElement | null>;
}

export function AddPropertyModal({
  mode,
  headline,
  instructions,
  title,
  suggestions,
  onTitleChange,
  onAddProperty,
  addressTypes,
  addressType,
  addressLoading,
  onAddressTypeChange,
  onAddAddress,
  onClose,
  titleInputRef,
}: AddPropertyModalProps) {
  const showProperty = mode === "property";
  const showAddress =
    mode === "address" && addressTypes.length > 0 && !addressLoading;

  useEffect(() => {
    if (mode === "none") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mode, onClose]);

  if (mode === "none") return null;

  return (
    <div
      id="id01"
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-property-headline"
        className="relative my-8 w-full max-w-lg rounded-xl border bg-card text-card-foreground shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 rounded-t-xl bg-slate-700 px-4 py-3 text-white">
          <div>
            <h2 id="new-property-headline" className="text-base font-semibold text-white">
              {headline}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="m-0 -mr-1 text-white hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="space-y-4 p-4">
          <p id="modal-instructions" className="text-sm text-muted-foreground">
            {instructions}
          </p>

          {showAddress ? (
            <div id="btn-add-address-dd" className="space-y-3">
              <Label htmlFor="address-type-selector">Address type</Label>
              <select
                id="address-type-selector"
                value={addressType}
                onChange={(event) => onAddressTypeChange(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option>{ADDRESS_PLACEHOLDER}</option>
                {addressTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </div>
          ) : null}

          {showProperty ? (
            <form
              id="add-property-form"
              autoComplete="off"
              onSubmit={(event) => {
                event.preventDefault();
                onAddProperty();
              }}
              className="space-y-2"
            >
              <Label htmlFor="new-property-title">Property title</Label>
              <AutocompleteInput
                value={title}
                suggestions={suggestions}
                onChange={onTitleChange}
                inputRef={titleInputRef}
                enabled={showProperty}
              />
            </form>
          ) : null}

          {showProperty ? (
            <Button
              type="button"
              id="btn-add-new-property"
              onClick={onAddProperty}
            >
              Add New Property
            </Button>
          ) : null}

          {showAddress ? (
            <Button
              type="button"
              id="btn-add-address"
              onClick={onAddAddress}
              className="w-full"
            >
              Add Address
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Port of autocomplete() from properties_builder.js:
 * case-insensitive "starts with" matches, at most 15 results, arrow-key
 * navigation, Enter to choose, click to choose, and click-outside to close.
 */
function AutocompleteInput({
  value,
  suggestions,
  onChange,
  inputRef,
  enabled,
}: {
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  enabled: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const matches = useMemo(() => {
    if (value === "") return [];
    const needle = value.toUpperCase();

    return suggestions
      .map((suggestion) => decode_html_entities(suggestion))
      .filter(
        (suggestion) =>
          suggestion.slice(0, value.length).toUpperCase() === needle
      )
      .slice(0, 15);
  }, [suggestions, value]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (
        wrapperRef.current !== null &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  const choose = (suggestion: string) => {
    onChange(suggestion);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((current) =>
        matches.length === 0 ? -1 : (current + 1) % matches.length
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((current) =>
        matches.length === 0
          ? -1
          : (current - 1 + matches.length) % matches.length
      );
    } else if (event.key === "Enter") {
      // The original keydown handler always suppressed Enter; the input is
      // inside a form, so without this React would add the property on Enter.
      event.preventDefault();
      if (open && active > -1 && matches[active] !== undefined) {
        choose(matches[active]);
      }
    }
  };

  // `enabled` is derived rather than clearing `open` in an effect.
  const showList = enabled && open && value !== "" && matches.length > 0;

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        ref={inputRef}
        id="new-property-title"
        type="text"
        name="myNewProperty"
        placeholder="Enter property title. For example, 'First Name'"
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {showList ? (
        <div
          id="new-property-titleautocomplete-list"
          className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-10 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"
        >
          {matches.map((suggestion, index) => (
            <div
              key={`${suggestion}-${index}`}
              className={cn(
                "cursor-pointer rounded-sm px-2 py-1.5 text-sm",
                index === active
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
              onClick={() => choose(suggestion)}
            >
              <strong>{suggestion.slice(0, value.length)}</strong>
              {suggestion.slice(value.length)}
              <input type="hidden" value={suggestion} readOnly />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
