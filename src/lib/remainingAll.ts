import type { Level } from "./types";

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
    return { price: row.price, qty: i === lastRemaining ? remainder : 0 };
  });
}
