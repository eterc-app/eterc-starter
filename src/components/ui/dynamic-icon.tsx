"use client";

import React, { useMemo } from "react";
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
    const candidate =
      (LucideIcons as Record<string, any>)[pascal] ||
      (LucideIcons as Record<string, any>)[`${pascal}Icon`] ||
      (LucideIcons.icons as Record<string, any>)?.[pascal];
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
