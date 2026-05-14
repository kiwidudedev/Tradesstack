import type { CSSProperties, ReactNode } from "react";

export const DEFAULT_PLATFORM_COLOR = "#0F172A";
export const DEFAULT_ACTION_COLOR = "#F45D22";

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

export function isValidHex(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX_PATTERN.test(value.trim());
}

function expandShortHex(hex: string): string {
  const clean = hex.replace(/^#/, "");
  if (clean.length === 3) {
    return clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return clean;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const expanded = expandShortHex(hex);
  const num = parseInt(expanded, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/** Multiply each channel by `factor` (0 = black, 1 = original). */
export function darken(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

/** Mix toward white. `weight` 0 = original, 1 = white. */
export function softTint(hex: string, weight = 0.9): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * weight,
    g + (255 - g) * weight,
    b + (255 - b) * weight
  );
}

interface BrandThemeProviderProps {
  platformColor: string | null;
  actionColor: string | null;
  children: ReactNode;
}

/**
 * Wraps children in a div that overrides the platform / action CSS variables
 * when the organisation has saved brand colours. When null/invalid, falls
 * through to the defaults defined in globals.css.
 *
 * Tokens controlled here:
 *   --topbar          (platform)
 *   --primary         (action)
 *   --primary-hover   (derived from action)
 *   --primary-pressed (derived from action)
 *   --primary-soft    (derived from action)
 */
export function BrandThemeProvider({
  platformColor,
  actionColor,
  children,
}: BrandThemeProviderProps) {
  const style: CSSProperties = {};

  if (isValidHex(platformColor)) {
    (style as Record<string, string>)["--topbar"] = platformColor;
  }

  if (isValidHex(actionColor)) {
    (style as Record<string, string>)["--primary"] = actionColor;
    (style as Record<string, string>)["--primary-hover"] = darken(actionColor, 0.92);
    (style as Record<string, string>)["--primary-pressed"] = darken(actionColor, 0.82);
    (style as Record<string, string>)["--primary-soft"] = softTint(actionColor, 0.88);
  }

  return <div style={style}>{children}</div>;
}
