import { NextResponse } from "next/server";
import { isExtractedSheet, isSheetStoreConfigured, readLatestSheet, writeLatestSheet } from "@/lib/sheetStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSheetStoreConfigured()) {
    return NextResponse.json({ configured: false, sheet: null, updatedAt: null });
  }
  const stored = await readLatestSheet();
  return NextResponse.json({
    configured: true,
    sheet: stored?.sheet ?? null,
    updatedAt: stored?.updatedAt ?? null,
  });
}

export async function PUT(req: Request) {
  if (!isSheetStoreConfigured()) {
    return NextResponse.json({ configured: false, ok: false }, { status: 503 });
  }
  try {
    const body = (await req.json()) as { sheet?: unknown };
    if (!isExtractedSheet(body.sheet)) {
      return NextResponse.json({ error: "시트 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const ok = await writeLatestSheet(body.sheet);
    return NextResponse.json({ configured: true, ok });
  } catch {
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
  }
}
