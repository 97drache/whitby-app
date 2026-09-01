import type { ExtractedSheet, Level } from "@/lib/types";

const KEY = "whitby:latest-sheet";

type StoredPayload = {
  sheet: ExtractedSheet;
  updatedAt: number;
};

function kvUrl(): string {
  return (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ""
  ).replace(/\/$/, "");
}

function kvToken(): string {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
}

export function isSheetStoreConfigured(): boolean {
  return Boolean(kvUrl() && kvToken());
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

async function kvRun(command: Array<string>): Promise<unknown> {
  const url = kvUrl();
  const token = kvToken();
  if (!url || !token) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { result?: unknown };
  return payload.result ?? null;
}

export async function readLatestSheet(): Promise<StoredPayload | null> {
  const raw = await kvRun(["GET", KEY]);
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPayload;
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
  const result = await kvRun(["SET", KEY, JSON.stringify(payload)]);
  return result === "OK";
}
