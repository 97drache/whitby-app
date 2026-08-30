import { NextResponse } from "next/server";
import type { ExtractedSheet, Level } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROMPT = `You are reading a Korean trading spreadsheet screenshot.

There are TWO separate "Limit Vwap" blocks:
1) UPPER Limit Vwap = BUY orders. Columns are 매수가 (buy price) and 개수 (quantity). There may be 1, 2, or 3 rows.
2) LOWER Limit Vwap = SELL orders. Columns are 매도가 (sell price) and 개수 (quantity). There may be 1, 2, or 3 rows.

"현재 보유 개수" is a single number on the RIGHT of the UPPER block, often on a light green background. Do not confuse it with 직전 매매 개수, 잔금, 종가, or 평단.

On the RIGHT of the LOWER/middle block:
- "현사이클 차수" is a cycle number, often like 29차. Return just the integer.
- "현사이클 시작 $" is a dollar amount (may include commas).
- "잔금 $" is a dollar amount on a light green background. Do not confuse it with 현사이클 실현수익 or 당일실현.

Return ONLY JSON with this shape:
{
  "buys": [{"price": number, "qty": number}],
  "sells": [{"price": number, "qty": number}],
  "holdings": number,
  "cycle": number,
  "startUsd": number,
  "cashUsd": number
}

Rules:
- prices are the left number in each Limit Vwap row; qty is the right number.
- Use dots as decimal separators. Strip thousands commas.
- Do not invent rows. Omit empty rows.
- holdings must be the 현재 보유 개수 integer.
- cycle must be the 현사이클 차수 integer (strip 차).
- startUsd is 현사이클 시작 $.
- cashUsd is 잔금 $.`;

const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
].filter((m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i);

function asLevel(value: unknown): Level | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const price = Number(row.price);
  const qty = Number(row.qty ?? row.quantity ?? row.count);
  if (!Number.isFinite(price) || !Number.isFinite(qty)) return null;
  return { price, qty };
}

function asMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").replace(/[차$]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseSheet(raw: unknown): ExtractedSheet {
  if (!raw || typeof raw !== "object") {
    throw new Error("시트 형식을 읽지 못했습니다.");
  }
  const data = raw as Record<string, unknown>;
  const buys = Array.isArray(data.buys)
    ? data.buys.map(asLevel).filter((v): v is Level => v !== null)
    : [];
  const sells = Array.isArray(data.sells)
    ? data.sells.map(asLevel).filter((v): v is Level => v !== null)
    : [];
  const holdings = Number(data.holdings);
  if (!buys.length) throw new Error("매수 Limit VWAP를 찾지 못했습니다.");
  if (!Number.isFinite(holdings)) throw new Error("현재 보유 개수를 찾지 못했습니다.");
  return {
    buys,
    sells,
    holdings,
    cycle: asMoney(data.cycle),
    startUsd: asMoney(data.startUsd),
    cashUsd: asMoney(data.cashUsd),
  };
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("모델이 JSON을 반환하지 않았습니다.");
    return JSON.parse(match[0]);
  }
}

async function callGemini(apiKey: string, mime: string, base64: string, model: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType: mime, data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    }),
  });

  const payload = (await res.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  if (!res.ok) {
    throw new Error(payload.error?.message || `${model} 호출에 실패했습니다.`);
  }

  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) throw new Error("모델이 비어 있는 응답을 보냈습니다.");
  return parseSheet(extractJson(text));
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0) {
      return NextResponse.json({ error: "이미지가 없습니다." }, { status: 400 });
    }

    const apiKey =
      process.env.GEMINI_API_KEY ||
      req.headers.get("x-gemini-key") ||
      "";
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Gemini API 키가 필요합니다. .env.local의 GEMINI_API_KEY 또는 앱 설정에 키를 넣어 주세요.",
        },
        { status: 401 },
      );
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const mime = image.type || "image/jpeg";
    const base64 = buffer.toString("base64");

    let lastError = "추출에 실패했습니다.";
    for (const model of MODELS) {
      try {
        const sheet = await callGemini(apiKey, mime, base64, model);
        return NextResponse.json({ sheet, model });
      } catch (err) {
        lastError = err instanceof Error ? err.message : lastError;
      }
    }

    return NextResponse.json({ error: lastError }, { status: 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
