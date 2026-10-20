"use client";

import type { ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeHtmlEntities } from "./properties-logic";

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
  const showAddress = mode === "address" && addressTypes.length > 0 && !addressLoading;

  return (
    <div
      id="id01"
      className="w3-modal"
      style={{ display: mode === "none" ? "none" : "block" }}
    >
      <div
        className="w3-modal-content w3-animate-left w3-card-4"
        style={{ width: "30em" }}
      >
        <header className="w3-container w3-blue-grey">
          <span
            onClick={onClose}
            className="w3-button w3-display-topright"
            role="button"
            aria-label="Close"
          >
            &times;
          </span>
          <h2 id="new-property-headline">{headline}</h2>
        </header>

        <div className="w3-container modal-body">
          <p id="modal-instructions">{instructions}</p>

          <form
            className="demo"
            id="btn-add-address-dd"
            style={{ display: showAddress ? "block" : "none" }}
            onSubmit={(event) => event.preventDefault()}
          >
            <select
              className="option3"
              id="address-type-selector"
              value={addressType}
              onChange={(event) => onAddressTypeChange(event.target.value)}
            >
              <option>{ADDRESS_PLACEHOLDER}</option>
              {addressTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </form>

          <form
            id="add-property-form"
            autoComplete="off"
            action="/action_page.php"
            style={{ display: showProperty ? "block" : "none" }}
            onSubmit={(event) => {
              event.preventDefault();
              onAddProperty();
            }}
          >
            <div className="autocomplete" style={{ width: "100%" }}>
              <AutocompleteInput
                value={title}
                suggestions={suggestions}
                onChange={onTitleChange}
                inputRef={titleInputRef}
                enabled={showProperty}
              />
            </div>
          </form>

          <p
            id="btn-add-new-property"
            style={{ display: showProperty ? "block" : "none" }}
          >
            <button
              type="button"
              onClick={onAddProperty}
              className="w3-button w3-blue"
            >
              Add New Property
            </button>
          </p>

          <p
            id="btn-add-address"
            style={{ display: showAddress ? "block" : "none" }}
          >
            <button
              type="button"
              onClick={onAddAddress}
              style={{ width: "90%" }}
              className="w3-button w3-blue"
            >
              Add Address
            </button>
          </p>
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
      .map((suggestion) => decodeHtmlEntities(suggestion))
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
    <div ref={wrapperRef}>
      <input
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
        <div id="new-property-titleautocomplete-list" className="autocomplete-items">
          {matches.map((suggestion, index) => (
            <div
              key={`${suggestion}-${index}`}
              className={index === active ? "autocomplete-active" : undefined}
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
