"use client";

import React, { useMemo, useState } from "react";
import { Hash, Palette, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// HSL to HEX helper (calculates dynamic hex codes)
function hslToHex(h: number, s: number, l: number): string {
  const lNorm = l / 100;
  const a = (s * Math.min(lNorm, 1 - lNorm)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return ["", f(0), f(8), f(4)].join("#");
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) return { h: 210, s: 80, l: 50 };
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h = Math.round(h * 60);
  }
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}

export interface ColorPickerProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ColorPicker({
  value = "",
  onChange,
  disabled = false,
  className,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);

  // Compute HSL from current value
  const initialHsl = useMemo(() => {
    return value ? hexToHsl(value) : { h: 217, s: 91, l: 60 };
  }, [value]);

  const [hue, setHue] = useState(initialHsl.h);
  const [saturation, setSaturation] = useState(initialHsl.s);
  const [lightness, setLightness] = useState(initialHsl.l);

  // Swatches dynamically generated from primary hues
  const swatches = useMemo(() => {
    const hues = [0, 25, 45, 140, 175, 215, 260, 320];
    return hues.map((hueVal) => hslToHex(hueVal, 85, 50));
  }, []);

  const handleHslChange = (newH: number, newS: number, newL: number) => {
    setHue(newH);
    setSaturation(newS);
    setLightness(newL);
    const hex = hslToHex(newH, newS, newL);
    onChange(hex);
  };

  const currentColor = value ? value : hslToHex(hue, saturation, lightness);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center gap-2.5 rounded-xl border border-input bg-card px-3 text-left transition-colors hover:border-foreground/30",
            className
          )}
        >
          <span
            className="size-5 rounded-md border border-border shadow-xs shrink-0"
            style={{ backgroundColor: currentColor ? currentColor : "transparent" }}
          />
          <span className="font-mono text-xs text-foreground flex-1 truncate">
            {value ? value : "Pick a color..."}
          </span>
          <Palette className="size-4 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-4 rounded-2xl border border-border bg-popover shadow-xs space-y-4"
      >
        {/* Color preview box */}
        <div
          className="h-24 w-full rounded-xl border border-border shadow-inner relative flex items-end justify-between p-2"
          style={{ backgroundColor: currentColor ? currentColor : "transparent" }}
        >
          <span className="rounded-md bg-background/80 px-2 py-0.5 font-mono text-xs font-semibold text-foreground backdrop-blur-xs">
            {currentColor}
          </span>
          {value ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="rounded-md bg-background/80 p-1 text-muted-foreground hover:text-foreground backdrop-blur-xs"
              title="Clear color"
            >
              <RotateCcw className="size-3" />
            </button>
          ) : null}
        </div>

        {/* Sliders: Hue, Saturation, Lightness */}
        <div className="space-y-2.5">
          {/* Hue spectrum */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>Hue</span>
              <span className="tabular-nums font-mono">{hue}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              value={hue}
              onChange={(e) => handleHslChange(Number(e.target.value), saturation, lightness)}
              className="w-full h-3 rounded-lg appearance-none cursor-pointer"
              style={{
                background: hue !== undefined ? "linear-gradient(to right, rgb(255,0,0) 0%, rgb(255,255,0) 17%, rgb(0,255,0) 33%, rgb(0,255,255) 50%, rgb(0,0,255) 67%, rgb(255,0,255) 83%, rgb(255,0,0) 100%)" : "none",
              }}
            />
          </div>

          {/* Saturation */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>Saturation</span>
              <span className="tabular-nums font-mono">{saturation}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={saturation}
              onChange={(e) => handleHslChange(hue, Number(e.target.value), lightness)}
              className="w-full h-3 rounded-lg appearance-none cursor-pointer"
              style={{
                background: saturation !== undefined ? `linear-gradient(to right, ${hslToHex(hue, 0, lightness)}, ${hslToHex(hue, 100, lightness)})` : "none",
              }}
            />
          </div>

          {/* Lightness */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>Lightness</span>
              <span className="tabular-nums font-mono">{lightness}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="90"
              value={lightness}
              onChange={(e) => handleHslChange(hue, saturation, Number(e.target.value))}
              className="w-full h-3 rounded-lg appearance-none cursor-pointer"
              style={{
                background: lightness !== undefined ? `linear-gradient(to right, rgb(0,0,0), ${hslToHex(hue, saturation, 50)}, rgb(255,255,255))` : "none",
              }}
            />
          </div>
        </div>

        {/* Swatches Grid */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between gap-1.5 flex-wrap">
            {swatches.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => {
                  onChange(swatch);
                  const parsed = hexToHsl(swatch);
                  setHue(parsed.h);
                  setSaturation(parsed.s);
                  setLightness(parsed.l);
                }}
                className={cn(
                  "size-5.5 rounded-full border border-border transition-transform hover:scale-110",
                  value === swatch && "outline-2 outline-offset-1 outline-primary"
                )}
                style={{ backgroundColor: swatch ? swatch : "transparent" }}
                aria-label={`Select color ${swatch}`}
              />
            ))}
          </div>
        </div>

        {/* Direct Hex Input */}
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <Hash className="size-3.5 text-muted-foreground" />
          <Input
            value={value.replace("#", "")}
            placeholder="HEX value..."
            maxLength={6}
            onChange={(e) => {
              const val = e.target.value.trim();
              if (/^[0-9a-fA-F]{0,6}$/.test(val)) {
                const hexVal = val ? `#${val}` : "";
                onChange(hexVal);
                if (val.length === 6) {
                  const parsed = hexToHsl(hexVal);
                  setHue(parsed.h);
                  setSaturation(parsed.s);
                  setLightness(parsed.l);
                }
              }
            }}
            className="h-8 font-mono text-xs uppercase rounded-lg bg-surface-subtle border-none"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
