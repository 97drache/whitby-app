import type { Level } from "./types";

export function isHalfMultiplier(multiplier: number): boolean {
  if (!Number.isFinite(multiplier) || Number.isInteger(multiplier)) return false;
  return Math.abs(Math.abs(multiplier % 1) - 0.5) < 1e-8;
}

/** 사사오입: 0.5 이상은 올림. */
export function roundHalfUp(n: number): number {
  return Math.floor(n + 0.5);
}

/** Integer multipliers stay exact. .5 multipliers round half up. */
export function scaleQty(qty: number, multiplier: number): number {
  const raw = qty * multiplier;
  if (Number.isInteger(multiplier)) return raw;
  if (isHalfMultiplier(multiplier)) return roundHalfUp(raw);
  return Math.round(raw);
}

/**
 * .5 multipliers: scale rows in price order so the running total
 * matches roundHalfUp(cumulativeQty * multiplier).
 * Buys pass holdings as baseQty (high price first).
 * Sells pass 0 (low price first).
 */
export function scaleLevels(
  levels: Level[],
  multiplier: number,
  baseQty = 0,
  priceOrder: "desc" | "asc" = "desc",
): Level[] {
  if (!isHalfMultiplier(multiplier) || !levels.length) {
    return levels.map((level) => ({
      price: level.price,
      qty: scaleQty(level.qty, multiplier),
    }));
  }

  const ranked = levels.map((level, index) => ({ ...level, index }));
  ranked.sort((a, b) => (priceOrder === "desc" ? b.price - a.price : a.price - b.price));

  let cumQty = baseQty;
  let cumScaled = baseQty ? roundHalfUp(baseQty * multiplier) : 0;
  const scaled = new Array<number>(levels.length);

  for (const row of ranked) {
    cumQty += row.qty;
    const target = roundHalfUp(cumQty * multiplier);
    scaled[row.index] = target - cumScaled;
    cumScaled = target;
  }

  return levels.map((level, index) => ({
    price: level.price,
    qty: scaled[index],
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
  return Math.round(value * multiplier * 100) / 100;
}
