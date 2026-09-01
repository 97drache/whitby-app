import { NextResponse } from "next/server";
import { isExtractedSheet, readLatestSheet, writeLatestSheet } from "@/lib/sheetStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { configured, stored } = await readLatestSheet();
  return NextResponse.json({
    configured,
    sheet: stored?.sheet ?? null,
    updatedAt: stored?.updatedAt ?? null,
  });
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { sheet?: unknown };
    if (!isExtractedSheet(body.sheet)) {
      return NextResponse.json({ error: "시트 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const ok = await writeLatestSheet(body.sheet);
    return NextResponse.json({ configured: true, ok });
  } catch {
    return NextResponse.json(
      { configured: false, ok: false, error: "Blob 저장소가 연결되지 않았거나 저장에 실패했습니다." },
      { status: 503 },
    );
  }
}
