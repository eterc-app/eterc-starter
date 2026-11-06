"use client";

import React, { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import * as LucideIcons from "lucide-react";

function toPascalCase(str: string): string {
  return str
    .trim()
    .replace(/(^\w|-\w)/g, (match) => match.replace("-", "").toUpperCase());
}

export interface DynamicIconProps extends React.SVGProps<SVGSVGElement> {
  name: string;
  className?: string;
  size?: number | string;
  color?: string;
}

export function DynamicIcon({
  name,
  className,
  size = 18,
  color,
  style,
  ...props
}: DynamicIconProps) {
  const IconComponent = useMemo(() => {
    if (!name) return LucideIcons.Box;
    const pascal = toPascalCase(name);
    const icon_map = LucideIcons as unknown as Record<
      string,
      LucideIcon | undefined
    >;
    const bundled = LucideIcons.icons as unknown as Record<
      string,
      LucideIcon | undefined
    >;
    const candidate =
      icon_map[pascal] || icon_map[`${pascal}Icon`] || bundled?.[pascal];
    return candidate || LucideIcons.Box;
  }, [name]);

  const customStyle = color ? { color, ...style } : style;

  return (
    <IconComponent
      className={className}
      size={size}
      style={customStyle}
      {...props}
    />
  );
}

