"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  ExternalLink,
  MapPin,
  Minus,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { IconPicker } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { CmsField } from "@/modules/cms/cms-types";
import {
  as_object,
  as_string,
  option_bool,
  option_number,
  option_string,
  parse_json_value,
} from "./types";

function color_or_undefined(value: string): string | undefined {
  return value ? value : undefined;
}

export function ToggleInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const checked =
    value === true || value === 1 || value === "1" || value === "true";
  const label = option_string(field, "label") || "Enabled";
  const iconOn = option_string(field, "iconOn", "icon_on") || "check";
  const iconOff = option_string(field, "iconOff", "icon_off") || "x";
  const colorOn = option_string(field, "colorOn", "color_on");
  const colorOff = option_string(field, "colorOff", "color_off");
  const icon = checked ? iconOn : iconOff;
  const color = checked ? colorOn : colorOff;

  return (
    <div className="flex min-h-13 items-center justify-between gap-3 rounded-lg border border-input bg-card px-4 py-2">
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <DynamicIcon
          name={icon}
          size={16}
          color={color_or_undefined(color)}
          className="text-muted-foreground"
        />
        {checked ? label : "Disabled"}
      </span>
      <Switch
        id={`cms-field-${field.name}`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next)}
      />
    </div>
  );
}

function to_local_datetime(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  let date: Date;
  if (typeof value === "number") {
    date = new Date(value > 10_000_000_000 ? value : value * 1000);
  } else {
    date = new Date(String(value));
  }
  if (Number.isNaN(date.getTime())) return as_string(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}

function to_local_date(value: unknown): string {
  const datetime = to_local_datetime(value);
  return datetime ? datetime.slice(0, 10) : "";
}

export function DatetimeInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const format = option_string(field, "format") || "long";
  const includeSeconds = option_bool(
    field,
    false,
    "includeSeconds",
    "include_seconds"
  );
  const relative = option_bool(field, false, "relative");
  const dateOnly = format === "date";
  const local = dateOnly ? to_local_date(value) : to_local_datetime(value);

  const update = (next: string) => {
    if (!next) {
      onChange(null);
      return;
    }
    const date = new Date(next);
    if (Number.isNaN(date.getTime())) {
      onChange(next);
      return;
    }
    onChange(date.toISOString());
  };

  return (
    <div className="space-y-2">
      <Input
        id={`cms-field-${field.name}`}
        type={dateOnly ? "date" : "datetime-local"}
        step={includeSeconds ? "1" : undefined}
        value={dateOnly ? local : local.slice(0, includeSeconds ? 19 : 16)}
        disabled={disabled}
        className="h-13 rounded-lg border-input bg-card"
        onChange={(event) => update(event.target.value)}
      />
      {relative && local ? (
        <p className="text-xs text-muted-foreground">
          Stored as {new Date(local).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}

export function SliderInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const min = option_number(field, 0, "minValue", "min");
  const max = option_number(field, 100, "maxValue", "max");
  const step = option_number(field, 1, "stepInterval", "step");
  const alwaysShowValue = option_bool(
    field,
    true,
    "alwaysShowValue",
    "always_show_value"
  );
  const parsed = Number(value);
  const current = Number.isFinite(parsed) ? parsed : min;

  const set_value = (next: number) => {
    if (!Number.isFinite(next)) return;
    onChange(field.type === "integer" ? Math.trunc(next) : next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 rounded-lg border border-input bg-card px-4 py-3">
        <input
          id={`cms-field-${field.name}`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          onChange={(event) => set_value(Number(event.target.value))}
          className="h-2 flex-1 cursor-pointer accent-foreground"
        />
        {alwaysShowValue ? (
          <span className="w-14 text-right font-mono text-sm tabular-nums text-muted-foreground">
            {current}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Decrease value"
          disabled={disabled || current <= min}
          onClick={() => set_value(current - step)}
        >
          <Minus className="size-3.5" />
        </Button>
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          className="h-13 flex-1 rounded-lg border-input bg-card text-center font-mono text-xs"
          onChange={(event) => set_value(Number(event.target.value))}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Increase value"
          disabled={disabled || current >= max}
          onClick={() => set_value(current + step)}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ColorInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const current = as_string(value);
  const opacity = option_bool(field, false, "opacity");
  const placeholder = `#${opacity ? "00000000" : "000000"}`;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ColorPicker
          value={current}
          disabled={disabled}
          onChange={(color) => onChange(color)}
        />
        <Input
          value={current}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={opacity ? 9 : 7}
          className="h-13 w-36 rounded-lg border-input bg-card font-mono text-xs"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {opacity ? (
        <p className="text-xs text-muted-foreground">
          Append two extra hex digits for transparency.
        </p>
      ) : null}
    </div>
  );
}

export function IconInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <IconPicker
      value={as_string(value)}
      disabled={disabled}
      placeholder={option_string(field, "placeholder") || "Select an icon"}
      onChange={(icon) => onChange(icon)}
      className="h-13 rounded-lg"
    />
  );
}

export function HashInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  const masked = option_bool(field, true, "masked");
  const current = as_string(value);

  return (
    <div className="relative">
      <Input
        id={`cms-field-${field.name}`}
        type={masked && !show ? "password" : "text"}
        value={current}
        disabled={disabled}
        placeholder={option_string(field, "placeholder") || "••••••••"}
        className="h-13 rounded-lg border-input bg-card pr-10 font-mono"
        onChange={(event) => onChange(event.target.value)}
      />
      {masked ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShow((current) => !current)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={show ? "Hide value" : "Show value"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      ) : null}
    </div>
  );
}

function map_coordinates(value: unknown): { lat: number; lng: number } {
  const object = parse_json_value<Record<string, unknown>>(value, {});
  const coordinates = Array.isArray(object.coordinates)
    ? object.coordinates
    : [];
  if (coordinates.length >= 2) {
    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  const lat = Number(object.lat ?? object.latitude);
  const lng = Number(object.lng ?? object.lon ?? object.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return { lat: 0, lng: 0 };
}

export function MapInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {

  const defaultLat = option_number(field, 0, "defaultLat", "default_lat");
  const defaultLng = option_number(field, 0, "defaultLng", "default_lng");
  const zoom = option_number(field, 2, "defaultZoom", "default_zoom");
  const height = option_number(field, 320, "height");
  const current = map_coordinates(value);
  const lat = value === null || value === undefined ? defaultLat : current.lat;
  const lng = value === null || value === undefined ? defaultLng : current.lng;

  const update = (nextLat: number, nextLng: number) => {
    onChange({
      type: "Point",
      coordinates: [nextLng, nextLat],
    });
  };

  const left = Math.max(0, Math.min(100, ((lng + 180) / 360) * 100));
  const top = Math.max(0, Math.min(100, ((90 - lat) / 180) * 100));
  const marker_style = { left: `${left}%`, top: `${top}%` };
  const map_style = { height: `${Math.max(120, height)}px` };

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <label
            htmlFor={`cms-field-${field.name}-lat`}
            className="text-xs font-medium text-muted-foreground"
          >
            Latitude
          </label>
          <Input
            id={`cms-field-${field.name}-lat`}
            type="number"
            step="any"
            min={-90}
            max={90}
            value={lat}
            disabled={disabled}
            className="h-13 rounded-lg border-input bg-card font-mono text-xs"
            onChange={(event) => update(Number(event.target.value), lng)}
          />
        </div>
        <div className="grid gap-1">
          <label
            htmlFor={`cms-field-${field.name}-lng`}
            className="text-xs font-medium text-muted-foreground"
          >
            Longitude
          </label>
          <Input
            id={`cms-field-${field.name}-lng`}
            type="number"
            step="any"
            min={-180}
            max={180}
            value={lng}
            disabled={disabled}
            className="h-13 rounded-lg border-input bg-card font-mono text-xs"
            onChange={(event) => update(lat, Number(event.target.value))}
          />
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-lg border border-border bg-surface-subtle"
        style={map_style}
      >
        <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:32px_32px]" />
        <span
          className="absolute grid size-7 -translate-x-1/2 -translate-y-full place-items-center rounded-full border border-border bg-card text-foreground shadow-xs"
          style={marker_style}
        >
          <MapPin className="size-4" strokeWidth={1.75} />
        </span>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-card/90 px-3 py-2 text-xs text-muted-foreground backdrop-blur-xs">
          <span className="font-mono">
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
          <span>Zoom {zoom}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
        </span>
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${Math.round(
            zoom
          )}/${lat}/${lng}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Open map
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

export function ObjectSummary({ value }: { value: unknown }) {
  const object = as_object(value);
  return (
    <span className={cn("font-mono text-xs text-muted-foreground")}>
      {Object.keys(object).length} key
      {Object.keys(object).length === 1 ? "" : "s"}
    </span>
  );
}
