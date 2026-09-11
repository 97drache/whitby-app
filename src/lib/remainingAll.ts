import type { ExtractedSheet, Level } from "./types";

export type DraftLevel = {
  price: number;
  qty: number;
  remainingAll: boolean;
};

export function isRemainingAllToken(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const compact = value.trim().toLowerCase().replace(/[\s_\-]/g, "");
  if (!compact) return true;
  return (
    compact.includes("남은전부") ||
    compact.includes("잔량전부") ||
    compact.includes("잔여전부") ||
    compact === "remaining" ||
    compact === "remainingall" ||
    compact === "allremaining" ||
    compact === "rest" ||
    compact === "all"
  );
}

export function parseQtyNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(/,/g, "").replace(/개/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * 남은전부 수량 = 잔고 − (같은 매수/매도 그룹의 숫자 개수 합).
 * 한 칸만 남은전부이면 잔고 전체가 그 칸 수량.
 */
export function fillRemainingAllQty(levels: DraftLevel[], holdings: number): Level[] {
  const otherSum = levels.reduce((sum, row) => (row.remainingAll ? sum : sum + row.qty), 0);
  const remainder = holdings - otherSum;
  const lastRemaining = levels.reduce((acc, row, i) => (row.remainingAll ? i : acc), -1);

  return levels.map((row, i) => {
    if (!row.remainingAll) return { price: row.price, qty: row.qty };
    return { price: row.price, qty: i === lastRemaining ? remainder : 0, remainingAll: true };
  });
}

export function isRemainingAllFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "true";
}

/**
 * Parser flags win. Otherwise, if this group's quantities already sum to holdings
 * (한칸 남은전부, or 숫자 + 남은전부), mark the last row.
 */
export function applyRemainingAll(levels: Level[], holdings: number): Level[] {
  if (!levels.length) return levels;
  const drafts: DraftLevel[] = levels.map((row) => ({
    price: row.price,
    qty: row.qty,
    remainingAll: Boolean(row.remainingAll),
  }));
  if (!drafts.some((row) => row.remainingAll)) {
    const sum = drafts.reduce((total, row) => total + row.qty, 0);
    if (sum === holdings) {
      drafts[drafts.length - 1].remainingAll = true;
    }
  }
  if (!drafts.some((row) => row.remainingAll)) return levels;
  return fillRemainingAllQty(drafts, holdings);
}

export function normalizeSheet(sheet: ExtractedSheet): ExtractedSheet {
  return {
    ...sheet,
    buys: applyRemainingAll(sheet.buys, sheet.holdings),
    sells: applyRemainingAll(sheet.sells, sheet.holdings),
  };
}
