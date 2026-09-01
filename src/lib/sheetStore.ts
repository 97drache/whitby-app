import { list, put } from "@vercel/blob";
import type { ExtractedSheet, Level } from "@/lib/types";

const PATH = "whitby-latest-sheet.json";

type StoredPayload = {
  sheet: ExtractedSheet;
  updatedAt: number;
};

export function isSheetStoreConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function isLevel(value: unknown): value is Level {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return Number.isFinite(Number(row.price)) && Number.isFinite(Number(row.qty));
}

export function isExtractedSheet(value: unknown): value is ExtractedSheet {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.buys) || !data.buys.length || !data.buys.every(isLevel)) return false;
  if (!Array.isArray(data.sells) || !data.sells.every(isLevel)) return false;
  return Number.isFinite(Number(data.holdings));
}

export async function readLatestSheet(): Promise<StoredPayload | null> {
  if (!isSheetStoreConfigured()) return null;
  try {
    const { blobs } = await list({ prefix: PATH, limit: 1 });
    const url = blobs[0]?.url;
    if (!url) return null;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = (await res.json()) as StoredPayload;
    if (!isExtractedSheet(parsed.sheet)) return null;
    return {
      sheet: parsed.sheet,
      updatedAt: Number(parsed.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export async function writeLatestSheet(sheet: ExtractedSheet): Promise<boolean> {
  if (!isSheetStoreConfigured()) return false;
  const payload: StoredPayload = { sheet, updatedAt: Date.now() };
  await put(PATH, JSON.stringify(payload), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
  return true;
}
