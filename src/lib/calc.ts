import type { Level } from "./types";

/** Integer multipliers stay exact. Fractional ones (e.g. 1.5x) round to nearest share. */
export function scaleQty(qty: number, multiplier: number): number {
  const raw = qty * multiplier;
  if (Number.isInteger(multiplier)) return raw;
  return Math.round(raw);
}

export function scaleLevels(levels: Level[], multiplier: number): Level[] {
  return levels.map((level) => ({
    price: level.price,
    qty: scaleQty(level.qty, multiplier),
  }));
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 4,
  });
}

export function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

export function formatMultiplier(value: number): string {
  if (Number.isInteger(value)) return `${value}`;
  return String(value);
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function remainingPercent(cash: number | null, start: number | null): number | null {
  if (cash == null || start == null || !Number.isFinite(cash) || !Number.isFinite(start) || start === 0) {
    return null;
  }
  return (cash / start) * 100;
}

export function scaleUsd(value: number | null, multiplier: number): number | null {
  if (value == null || !Number.isFinite(value) || !Number.isFinite(multiplier)) return null;
  return value * multiplier;
}
