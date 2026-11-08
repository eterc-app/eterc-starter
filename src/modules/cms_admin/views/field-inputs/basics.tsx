"use client";

import { useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Minus,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { IconPicker } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { CmsField } from "@/modules/cms/cms-types";
import { MapCanvas, type MapGeometryType } from "./MapCanvas";
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
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const datetime = to_local_datetime(value);
  return datetime ? datetime.slice(0, 10) : "";
}

function datetime_for_display(
  value: unknown,
  type: string
): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (type === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (type === "time" && typeof value === "string" && /^\d{2}:\d{2}/.test(value)) {
    const date = new Date(`1970-01-01T${value}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date =
    typeof value === "number"
      ? new Date(value > 10_000_000_000 ? value : value * 1000)
      : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function relative_time(date: Date): string {
  const seconds = (date.getTime() - Date.now()) / 1000;
  const units = [
    { name: "year", seconds: 31_536_000 },
    { name: "month", seconds: 2_592_000 },
    { name: "week", seconds: 604_800 },
    { name: "day", seconds: 86_400 },
    { name: "hour", seconds: 3_600 },
    { name: "minute", seconds: 60 },
    { name: "second", seconds: 1 },
  ] as const;
  const unit = units.find(({ seconds: unitSeconds }) =>
    Math.abs(seconds) >= unitSeconds
  ) ?? units[units.length - 1];
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    Math.round(seconds / unit.seconds),
    unit.name
  );
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
  const storedFormat = option_string(field, "format");
  const type =
    option_string(field, "type") ||
    (storedFormat === "date" ? "date" : "datetime");
  const format = storedFormat === "date" ? "long" : storedFormat || "long";
  const includeSeconds = option_bool(
    field,
    false,
    "includeSeconds",
    "include_seconds"
  ) || type === "timestamp";
  const relative = option_bool(field, false, "relative");
  const use24Hour = option_bool(field, false, "use24Hour", "use_24_hour");
  const dateOnly = type === "date";
  const timeOnly = type === "time";
  const displayDate = datetime_for_display(value, type);
  const displayFormat: Intl.DateTimeFormatOptions = {
    ...(dateOnly || type === "datetime" || type === "timestamp"
      ? { dateStyle: format === "short" ? "short" : "long" }
      : {}),
    ...(timeOnly || type === "datetime" || type === "timestamp"
      ? {
          timeStyle:
            includeSeconds && format !== "short"
              ? "medium"
              : "short",
        }
      : {}),
    ...(use24Hour ? { hourCycle: "h23" as const } : {}),
  };
  const displayValue = displayDate
    ? relative && !timeOnly
      ? relative_time(displayDate)
      : new Intl.DateTimeFormat(undefined, displayFormat).format(displayDate)
    : "";

  const [open, setOpen] = useState(false);
  const [viewedMonth, setViewedMonth] = useState(() => {
    const initial = datetime_for_display(value, type) ?? new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  const selectedHour = displayDate
    ? use24Hour
      ? displayDate.getHours()
      : displayDate.getHours() % 12 || 12
    : use24Hour
      ? new Date().getHours()
      : new Date().getHours() % 12 || 12;
  const selectedMinute = displayDate?.getMinutes() ?? new Date().getMinutes();
  const selectedSecond = displayDate?.getSeconds() ?? 0;
  const isPm = (displayDate?.getHours() ?? new Date().getHours()) >= 12;
  const selectedDay = dateOnly
    ? to_local_date(value)
    : displayDate
      ? to_local_date(displayDate.toISOString())
      : "";
  const firstDay = new Date(
    viewedMonth.getFullYear(),
    viewedMonth.getMonth(),
    1
  ).getDay();
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      viewedMonth.getFullYear(),
      viewedMonth.getMonth(),
      index - firstDay + 1
    );
    return {
      date,
      day: date.getDate(),
      inMonth: date.getMonth() === viewedMonth.getMonth(),
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(date.getDate()).padStart(2, "0")}`,
    };
  });

  const updateDateAndTime = (
    date: Date,
    hour = selectedHour,
    minute = selectedMinute,
    second = selectedSecond,
    pm = isPm
  ) => {
    if (dateOnly) {
      onChange(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(date.getDate()).padStart(2, "0")}`
      );
      return;
    }

    let hours = hour;
    if (!use24Hour) {
      hours = (hour % 12) + (pm ? 12 : 0);
    }
    date.setHours(hours, minute, second, 0);
    if (timeOnly) {
      onChange(
        `${String(hours).padStart(2, "0")}:${String(minute).padStart(
          2,
          "0"
        )}${includeSeconds ? `:${String(second).padStart(2, "0")}` : ""}`
      );
    } else {
      onChange(date.toISOString());
    }
  };

  const today = new Date();
  const dateForTime = displayDate ?? today;
  const setTimePart = (
    part: "hour" | "minute" | "second" | "period",
    raw: string
  ) => {
    const date = new Date(dateForTime);
    const nextHour = part === "hour" ? Number(raw) : selectedHour;
    const nextMinute = part === "minute" ? Number(raw) : selectedMinute;
    const nextSecond = part === "second" ? Number(raw) : selectedSecond;
    const nextPm = part === "period" ? raw === "PM" : isPm;
    updateDateAndTime(date, nextHour, nextMinute, nextSecond, nextPm);
  };
  const selectDay = (day: (typeof days)[number]) => {
    const selected = new Date(
      day.date.getFullYear(),
      day.date.getMonth(),
      day.date.getDate()
    );
    updateDateAndTime(selected);
    if (day.date.getMonth() !== viewedMonth.getMonth()) {
      setViewedMonth(new Date(day.date.getFullYear(), day.date.getMonth(), 1));
    }
    if (dateOnly) setOpen(false);
  };
  const setNow = () => {
    const now = new Date();
    updateDateAndTime(now, use24Hour ? now.getHours() : now.getHours() % 12 || 12,
      now.getMinutes(), now.getSeconds(), now.getHours() >= 12);
  };

  const selectClassName =
    "h-12 appearance-none rounded-md border-0 bg-[#dedede] px-3 text-center text-base font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-black";

  return (
    <div className="space-y-2">
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            const current = datetime_for_display(value, type);
            if (current) {
              setViewedMonth(
                new Date(current.getFullYear(), current.getMonth(), 1)
              );
            }
          }
          setOpen(nextOpen);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={`cms-field-${field.name}`}
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-13 w-full justify-between rounded-lg border-input bg-card px-4 text-left text-sm font-normal text-foreground hover:bg-card"
          >
            <span className={cn(!displayValue && "text-muted-foreground")}>
              {displayValue || "Select date and time"}
            </span>
            <CalendarDays className="size-5 shrink-0 text-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-[min(36rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border-border bg-white p-0 text-black shadow-[0_8px_24px_-8px_rgb(0_0_0/0.25)]"
        >
          {!timeOnly ? (
            <>
              <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center bg-[#dedede] px-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Previous month"
                  className="size-10 text-black hover:bg-black/5"
                  onClick={() =>
                    setViewedMonth(
                      new Date(
                        viewedMonth.getFullYear(),
                        viewedMonth.getMonth() - 1,
                        1
                      )
                    )
                  }
                >
                  <ChevronLeft className="size-5" />
                </Button>
                <div className="flex items-center justify-center gap-3">
                  <label className="relative flex items-center">
                    <select
                      aria-label="Calendar month"
                      value={viewedMonth.getMonth()}
                      className="cursor-pointer appearance-none bg-transparent pr-5 text-base font-semibold outline-none"
                      onChange={(event) =>
                        setViewedMonth(
                          new Date(
                            viewedMonth.getFullYear(),
                            Number(event.target.value),
                            1
                          )
                        )
                      }
                    >
                      {Array.from({ length: 12 }, (_, month) => (
                        <option key={month} value={month}>
                          {new Intl.DateTimeFormat(undefined, {
                            month: "long",
                          }).format(new Date(2024, month, 1))}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 size-4" />
                  </label>
                  <label className="relative flex items-center">
                    <select
                      aria-label="Calendar year"
                      value={viewedMonth.getFullYear()}
                      className="cursor-pointer appearance-none bg-transparent pr-5 text-base font-semibold outline-none"
                      onChange={(event) =>
                        setViewedMonth(
                          new Date(
                            Number(event.target.value),
                            viewedMonth.getMonth(),
                            1
                          )
                        )
                      }
                    >
                      {Array.from(
                        { length: 201 },
                        (_, index) => new Date().getFullYear() - 100 + index
                      ).map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 size-4" />
                  </label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Next month"
                  className="size-10 text-black hover:bg-black/5"
                  onClick={() =>
                    setViewedMonth(
                      new Date(
                        viewedMonth.getFullYear(),
                        viewedMonth.getMonth() + 1,
                        1
                      )
                    )
                  }
                >
                  <ChevronRight className="size-5" />
                </Button>
              </div>
              <div className="grid grid-cols-7 bg-[#dedede] px-2 pb-1 text-center text-xs font-semibold">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (weekday) => (
                    <span key={weekday} className="py-2">
                      {weekday}
                    </span>
                  )
                )}
              </div>
              <div className="grid grid-cols-7 px-2 pb-2">
                {days.map((day) => {
                  const isSelected = selectedDay === day.value;
                  const isToday =
                    day.value ===
                    `${today.getFullYear()}-${String(
                      today.getMonth() + 1
                    ).padStart(2, "0")}-${String(today.getDate()).padStart(
                      2,
                      "0"
                    )}`;
                  return (
                    <button
                      key={day.key}
                      type="button"
                      aria-pressed={isSelected}
                      className={cn(
                        "m-0.5 h-10 rounded-lg text-sm transition-colors hover:bg-[#f1f3f8] focus-visible:outline-2 focus-visible:outline-black",
                        !day.inMonth && "text-muted-foreground",
                        isToday && !isSelected && "bg-[#f5f7fb]",
                        isSelected &&
                          "border-2 border-black font-semibold text-black"
                      )}
                      onClick={() => selectDay(day)}
                    >
                      {day.day}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
          {!dateOnly ? (
            <div className="flex items-center justify-center gap-2 border-t border-[#d0d0d0] px-4 py-3">
              <select
                aria-label="Hour"
                value={selectedHour}
                className={selectClassName}
                onChange={(event) => setTimePart("hour", event.target.value)}
              >
                {Array.from(
                  { length: use24Hour ? 24 : 12 },
                  (_, index) => (use24Hour ? index : index + 1)
                ).map((hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <span className="text-lg font-semibold">:</span>
              <select
                aria-label="Minute"
                value={selectedMinute}
                className={selectClassName}
                onChange={(event) => setTimePart("minute", event.target.value)}
              >
                {Array.from({ length: 60 }, (_, minute) => minute).map(
                  (minute) => (
                    <option key={minute} value={minute}>
                      {String(minute).padStart(2, "0")}
                    </option>
                  )
                )}
              </select>
              {includeSeconds ? (
                <>
                  <span className="text-lg font-semibold">:</span>
                  <select
                    aria-label="Second"
                    value={selectedSecond}
                    className={selectClassName}
                    onChange={(event) =>
                      setTimePart("second", event.target.value)
                    }
                  >
                    {Array.from({ length: 60 }, (_, second) => second).map(
                      (second) => (
                        <option key={second} value={second}>
                          {String(second).padStart(2, "0")}
                        </option>
                      )
                    )}
                  </select>
                </>
              ) : null}
              {!use24Hour ? (
                <select
                  aria-label="AM or PM"
                  value={isPm ? "PM" : "AM"}
                  className={selectClassName}
                  onChange={(event) => setTimePart("period", event.target.value)}
                >
                  <option>AM</option>
                  <option>PM</option>
                </select>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="flex h-14 w-full items-center justify-center border-t border-[#d0d0d0] bg-white text-sm font-semibold hover:bg-[#f7f7f7]"
            onClick={setNow}
          >
            Set to Now
          </button>
        </PopoverContent>
      </Popover>
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

function map_value(value: unknown): Record<string, unknown> {
  const object = parse_json_value<Record<string, unknown>>(value, {});
  if (Array.isArray(object.coordinates)) return object;
  const lat = Number(object.lat ?? object.latitude);
  const lng = Number(object.lng ?? object.lon ?? object.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { type: "Point", coordinates: [lng, lat] };
  }
  return {};
}

const MAP_GEOMETRY_TYPES: MapGeometryType[] = [
  "Point",
  "LineString",
  "Polygon",
  "MultiPoint",
  "MultiLineString",
];

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
  const defaultLat = Math.max(-90, Math.min(90, option_number(field, 0, "defaultLat", "default_lat")));
  const defaultLng = Math.max(-180, Math.min(180, option_number(field, 0, "defaultLng", "default_lng")));
  const zoom = Math.max(0, Math.min(20, option_number(field, 2, "defaultZoom", "default_zoom")));
  const height = Math.max(120, Math.min(1000, option_number(field, 320, "height")));
  const configuredType = option_string(field, "geometryType", "geometry_type");
  const geometryType = MAP_GEOMETRY_TYPES.includes(configuredType as MapGeometryType)
    ? (configuredType as MapGeometryType)
    : "Point";
  const provider =
    process.env.NEXT_PUBLIC_ETERC_MAP_PROVIDER === "google" ? "google" : "openstreetmap";
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const parsed = map_value(value);
  const coordinates =
    parsed.type === geometryType ? parsed.coordinates : geometryType === "Point" ? [defaultLng, defaultLat] : [];
  const currentPoint =
    geometryType === "Point" && Array.isArray(coordinates) && coordinates.length >= 2
      ? { lng: Number(coordinates[0]), lat: Number(coordinates[1]) }
      : { lat: defaultLat, lng: defaultLng };
  if (
    !Number.isFinite(currentPoint.lat) ||
    currentPoint.lat < -90 ||
    currentPoint.lat > 90 ||
    !Number.isFinite(currentPoint.lng) ||
    currentPoint.lng < -180 ||
    currentPoint.lng > 180
  ) {
    currentPoint.lat = defaultLat;
    currentPoint.lng = defaultLng;
  }
  const serializedCoordinates = JSON.stringify(coordinates);
  const [draftState, setDraftState] = useState({
    source: serializedCoordinates,
    coordinates,
  });
  const draftCoordinates =
    draftState.source === serializedCoordinates ? draftState.coordinates : coordinates;
  const setDraftCoordinates = (nextCoordinates: unknown) => {
    setDraftState({ source: serializedCoordinates, coordinates: nextCoordinates });
  };

  const update = (nextCoordinates: unknown) => {
    let committedCoordinates: unknown | null = null;
    if (geometryType === "Point") {
      if (
        Array.isArray(nextCoordinates) &&
        nextCoordinates.length === 2 &&
        Number.isFinite(Number(nextCoordinates[0])) &&
        Number.isFinite(Number(nextCoordinates[1])) &&
        Number(nextCoordinates[0]) >= -180 &&
        Number(nextCoordinates[0]) <= 180 &&
        Number(nextCoordinates[1]) >= -90 &&
        Number(nextCoordinates[1]) <= 90
      ) {
        committedCoordinates = nextCoordinates;
      }
    } else if (geometryType === "MultiPoint") {
      if (Array.isArray(nextCoordinates) && nextCoordinates.length > 0) {
        committedCoordinates = nextCoordinates;
      }
    } else if (geometryType === "LineString") {
      if (Array.isArray(nextCoordinates) && nextCoordinates.length >= 2) {
        committedCoordinates = nextCoordinates;
      }
    } else if (geometryType === "Polygon") {
      const ring = Array.isArray(nextCoordinates) ? nextCoordinates[0] : null;
      if (Array.isArray(ring) && ring.length >= 4) {
        committedCoordinates = nextCoordinates;
      }
    } else if (geometryType === "MultiLineString" && Array.isArray(nextCoordinates)) {
      const validLines = nextCoordinates.filter(
        (line): line is unknown[] => Array.isArray(line) && line.length >= 2,
      );
      if (validLines.length > 0) {
        committedCoordinates = validLines;
      }
    }
    setDraftState({
      source:
        committedCoordinates === null
          ? serializedCoordinates
          : JSON.stringify(committedCoordinates) ?? serializedCoordinates,
      coordinates: nextCoordinates,
    });
    if (committedCoordinates !== null) {
      onChange({ type: geometryType, coordinates: committedCoordinates });
    }
  };

  const addPosition = (position: [number, number]) => {
    if (geometryType === "Point") {
      update(position);
    } else if (geometryType === "MultiPoint" || geometryType === "LineString") {
      update([...(Array.isArray(draftCoordinates) ? draftCoordinates : []), position]);
    } else if (geometryType === "Polygon") {
      const ring = Array.isArray(draftCoordinates) && Array.isArray(draftCoordinates[0])
        ? [...(draftCoordinates[0] as unknown[])]
        : [];
      if (
        ring.length > 1 &&
        JSON.stringify(ring[0]) === JSON.stringify(ring[ring.length - 1])
      ) {
        ring.pop();
      }
      ring.push(position);
      if (ring.length >= 3) ring.push(ring[0]);
      update([ring]);
    } else {
      const lines = Array.isArray(draftCoordinates)
        ? (draftCoordinates as unknown[][]).map((line) => [...line])
        : [];
      if (lines.length === 0) lines.push([]);
      lines[lines.length - 1].push(position);
      update(lines);
    }
  };

  const startNewLine = () => {
    const lines = Array.isArray(draftCoordinates)
      ? (draftCoordinates as unknown[][]).map((line) => [...line])
      : [];
    if (lines.length > 0 && lines[lines.length - 1].length === 0) return;
    update([...lines, []]);
  };

  const clear = () => {
    setDraftCoordinates([]);
    onChange(null);
  };
  const countPositions = (items: unknown): number => {
    if (!Array.isArray(items)) return 0;
    if (items.length >= 2 && Number.isFinite(Number(items[0])) && Number.isFinite(Number(items[1]))) {
      return 1;
    }
    return items.reduce<number>((total, item) => total + countPositions(item), 0);
  };

  return (
    <div className="space-y-2">
      {geometryType === "Point" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <label htmlFor={`cms-field-${field.name}-lat`} className="text-xs font-medium text-muted-foreground">
              Latitude
            </label>
            <Input
              id={`cms-field-${field.name}-lat`}
              type="number"
              step="any"
              min={-90}
              max={90}
              value={currentPoint.lat}
              disabled={disabled}
              className="h-13 rounded-lg border-input bg-card font-mono text-xs"
              onChange={(event) => update([currentPoint.lng, Number(event.target.value)])}
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor={`cms-field-${field.name}-lng`} className="text-xs font-medium text-muted-foreground">
              Longitude
            </label>
            <Input
              id={`cms-field-${field.name}-lng`}
              type="number"
              step="any"
              min={-180}
              max={180}
              value={currentPoint.lng}
              disabled={disabled}
              className="h-13 rounded-lg border-input bg-card font-mono text-xs"
              onChange={(event) => update([Number(event.target.value), currentPoint.lat])}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Click the map to add {geometryType === "MultiPoint" ? "points" : "vertices"}.</span>
          <span>{countPositions(draftCoordinates)} point(s)</span>
        </div>
      )}

      <MapCanvas
        provider={provider}
        apiKey={apiKey}
        geometryType={geometryType}
        coordinates={draftCoordinates}
        center={{ lat: currentPoint.lat, lng: currentPoint.lng }}
        zoom={zoom}
        height={Math.max(120, height)}
        disabled={disabled ?? false}
        onMapClick={addPosition}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {geometryType === "MultiLineString" ? (
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={startNewLine}>
              New line
            </Button>
          ) : null}
          {geometryType !== "Point" ? (
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={clear}>
              Clear
            </Button>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">
          {provider === "google" ? "Google Maps" : "OpenStreetMap"}
        </span>
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
