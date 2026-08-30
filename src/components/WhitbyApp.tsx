"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compressImage } from "@/lib/compress";
import {
  formatMultiplier,
  formatPrice,
  formatQty,
  scaleLevels,
  scaleQty,
} from "@/lib/calc";
import { PRESET_MULTIPLIERS, SAMPLE_SHEET, type ExtractedSheet, type Level } from "@/lib/types";

const KEY_STORAGE = "whitby_gemini_key";

export default function WhitbyApp({ initialSheet = null }: { initialSheet?: ExtractedSheet | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ExtractedSheet | null>(initialSheet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(initialSheet ? "sample" : null);
  const [customRaw, setCustomRaw] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);

  useEffect(() => {
    setApiKey(localStorage.getItem(KEY_STORAGE) || "");
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  async function runParse(imageFile: File) {
    setBusy(true);
    setError(null);
    try {
      const blob = await compressImage(imageFile);
      const form = new FormData();
      form.append("image", blob, "sheet.jpg");
      const headers: HeadersInit = {};
      if (apiKey.trim()) headers["x-gemini-key"] = apiKey.trim();
      const res = await fetch("/api/parse", { method: "POST", body: form, headers });
      const data = (await res.json()) as { sheet?: ExtractedSheet; model?: string; error?: string };
      if (!res.ok || !data.sheet) throw new Error(data.error || "추출에 실패했습니다.");
      setSheet(data.sheet);
      setSheetKey((n) => n + 1);
      setShowSource(false);
      setModelUsed(data.model || null);
      if (apiKey.trim()) localStorage.setItem(KEY_STORAGE, apiKey.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "추출에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function onPick(next: File | null) {
    if (!next) return;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(next);
    previewRef.current = url;
    setPreview(url);
    setSheet(null);
    setModelUsed(null);
    await runParse(next);
  }

  const customMultiplier = Number(customRaw);
  const customValid = customRaw.trim() !== "" && Number.isFinite(customMultiplier) && customMultiplier > 0;

  return (
    <main className="mx-auto min-h-dvh max-w-[430px] px-4 pb-[calc(32px+var(--safe-bottom))] pt-[calc(16px+var(--safe-top))]">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="h-11 w-11 rounded-[13px]" />
          <div>
            <p className="font-[family-name:var(--font-display)] text-[30px] leading-none tracking-wide text-stone-900">
              Whitby
            </p>
            <p className="mt-1 text-[12px] text-stone-500">Limit VWAP · 배수 계산</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          className="rounded-full bg-white px-3 py-1.5 text-xs text-stone-500 ring-1 ring-stone-200"
        >
          {showKey ? "닫기" : "설정"}
        </button>
      </header>

      {showKey && (
        <section className="card mb-4 p-4">
          <p className="text-sm font-medium">Gemini API 키</p>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            사진은 기기에만 잠시 쓰이고 서버에 저장하지 않습니다. 배포 환경에는 Vercel 환경 변수로 넣어도 됩니다.
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIza..."
            className="mt-3 w-full rounded-2xl bg-stone-50 px-3 py-2.5 text-sm outline-none ring-1 ring-stone-200 focus:ring-stone-400"
          />
        </section>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="card mb-3 block w-full overflow-hidden text-left"
      >
        {preview ? (
          <div className="flex items-center gap-3 p-3">
            <img src={preview} alt="올린 시트" className="h-16 w-16 rounded-2xl object-cover ring-1 ring-stone-200" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{busy ? "숫자를 읽는 중…" : "시트 사진"}</p>
              <p className="text-xs text-stone-500">탭해서 다른 사진으로 바꾸기 · 저장하지 않음</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100 text-2xl text-stone-700">
              +
            </span>
            <span className="mt-4 text-base font-medium">시트 사진 올리기</span>
            <span className="mt-1 text-xs leading-relaxed text-stone-500">
              올리면 바로 읽습니다. 사진은 저장되지 않아요.
            </span>
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          e.target.value = "";
          onPick(file);
        }}
      />

      {busy && (
        <div className="card mb-3 px-4 py-3 text-sm text-stone-500">
          매수 · 매도 · 보유 개수를 읽고 있습니다…
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-3xl bg-rose-50 px-4 py-3 text-sm text-rose-600 ring-1 ring-rose-100">
          {error}
        </div>
      )}

      <div className="mb-5 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setSheet(SAMPLE_SHEET);
            setSheetKey((n) => n + 1);
            setModelUsed("sample");
            setError(null);
            setShowSource(false);
          }}
          className="rounded-full bg-white px-3 py-1.5 text-xs text-stone-500 ring-1 ring-stone-200"
        >
          샘플로 미리보기
        </button>
      </div>

      {!sheet ? (
        <p className="px-1 text-center text-sm leading-relaxed text-stone-400">
          시트를 올리면 9배수, 1.5배수, 6배수, 직접 입력이 여기에 나타납니다.
        </p>
      ) : (
        <div className="space-y-3">
          {PRESET_MULTIPLIERS.map((n) => (
            <MultiplierCard key={n} title={`${formatMultiplier(n)}배수`} multiplier={n} sheet={sheet} />
          ))}

          <section className="card p-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-stone-500">직접 입력</p>
                <p className="font-[family-name:var(--font-display)] text-[26px] leading-none text-stone-900">
                  {customValid ? `${formatMultiplier(customMultiplier)}배수` : "배수"}
                </p>
              </div>
              <input
                inputMode="decimal"
                value={customRaw}
                onChange={(e) => setCustomRaw(e.target.value)}
                placeholder="예: 3"
                className="w-24 rounded-2xl bg-stone-50 px-3 py-2 text-right text-lg tabular outline-none ring-1 ring-stone-200 focus:ring-stone-400"
              />
            </div>
            {customValid ? (
              <ScaledTable sheet={sheet} multiplier={customMultiplier} />
            ) : (
              <p className="text-xs text-stone-500">배수를 넣으면 바로 계산합니다.</p>
            )}
          </section>

          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            className="w-full py-2 text-center text-xs text-stone-400"
          >
            {showSource ? "읽어온 값 접기" : "읽어온 값 수정"}
          </button>

          {showSource && (
            <ExtractedEditor key={sheetKey} sheet={sheet} modelUsed={modelUsed} onChange={setSheet} />
          )}
        </div>
      )}
    </main>
  );
}

function NumberField({
  value,
  onChange,
  className,
  inputMode,
}: {
  value: number;
  onChange: (value: number) => void;
  className: string;
  inputMode: "decimal" | "numeric";
}) {
  const [raw, setRaw] = useState(String(value));
  return (
    <input
      inputMode={inputMode}
      value={raw}
      onChange={(e) => {
        const next = e.target.value;
        setRaw(next);
        if (next.trim() === "" || next === "." || next === "-") {
          onChange(0);
          return;
        }
        const n = Number(next.replace(/,/g, ""));
        if (Number.isFinite(n)) onChange(n);
      }}
      className={className}
    />
  );
}

function ExtractedEditor({
  sheet,
  modelUsed,
  onChange,
}: {
  sheet: ExtractedSheet;
  modelUsed: string | null;
  onChange: (next: ExtractedSheet) => void;
}) {
  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-stone-500">숫자를 고치면 배수도 바로 바뀝니다.</p>
        {modelUsed && modelUsed !== "sample" && (
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-400">{modelUsed}</span>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs text-stone-500">현재 보유 개수</p>
        <NumberField
          value={sheet.holdings}
          inputMode="numeric"
          className="w-full rounded-2xl bg-emerald-50 px-3 py-3 text-3xl tabular text-emerald-700 outline-none"
          onChange={(holdings) => onChange({ ...sheet, holdings })}
        />
      </div>
      <LevelEditor label="매수 Limit VWAP" tone="buy" levels={sheet.buys} onChange={(buys) => onChange({ ...sheet, buys })} />
      <LevelEditor label="매도 Limit VWAP" tone="sell" levels={sheet.sells} onChange={(sells) => onChange({ ...sheet, sells })} />
    </div>
  );
}

function LevelEditor({
  label,
  tone,
  levels,
  onChange,
}: {
  label: string;
  tone: "buy" | "sell";
  levels: Level[];
  onChange: (next: Level[]) => void;
}) {
  const accent = tone === "buy" ? "text-emerald-700" : "text-rose-600";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-xs font-medium ${accent}`}>{label}</p>
        <button type="button" onClick={() => onChange([...levels, { price: 0, qty: 0 }])} className="text-[11px] text-stone-400">
          행 추가
        </button>
      </div>
      <div className="mb-1 grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-[11px] text-stone-400">
        <span>{tone === "buy" ? "매수가" : "매도가"}</span>
        <span>개수</span>
        <span className="w-8" />
      </div>
      <div className="space-y-2">
        {levels.map((level, i) => (
          <div key={`${tone}-${i}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <NumberField
              value={level.price}
              inputMode="decimal"
              className="rounded-2xl bg-stone-50 px-3 py-2 text-sm tabular outline-none ring-1 ring-stone-200"
              onChange={(price) => {
                const next = [...levels];
                next[i] = { ...level, price };
                onChange(next);
              }}
            />
            <NumberField
              value={level.qty}
              inputMode="numeric"
              className="rounded-2xl bg-stone-50 px-3 py-2 text-sm tabular outline-none ring-1 ring-stone-200"
              onChange={(qty) => {
                const next = [...levels];
                next[i] = { ...level, qty };
                onChange(next);
              }}
            />
            <button type="button" onClick={() => onChange(levels.filter((_, idx) => idx !== i))} className="px-2 text-xs text-stone-400">
              삭제
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MultiplierCard({ title, multiplier, sheet }: { title: string; multiplier: number; sheet: ExtractedSheet }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-[26px] leading-none text-stone-900">{title}</h2>
        {!Number.isInteger(multiplier) && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">반올림</span>
        )}
      </div>
      <ScaledTable sheet={sheet} multiplier={multiplier} />
    </section>
  );
}

function ScaledTable({ sheet, multiplier }: { sheet: ExtractedSheet; multiplier: number }) {
  const buys = useMemo(() => scaleLevels(sheet.buys, multiplier), [sheet.buys, multiplier]);
  const sells = useMemo(() => scaleLevels(sheet.sells, multiplier), [sheet.sells, multiplier]);
  const holdings = scaleQty(sheet.holdings, multiplier);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between rounded-2xl bg-emerald-50 px-4 py-3">
        <span className="text-xs text-emerald-800/70">보유 개수</span>
        <span className="text-2xl tabular font-semibold text-emerald-700">{formatQty(holdings)}</span>
      </div>
      <LevelTable caption="매수" tone="buy" rows={buys} />
      {sells.length > 0 && <LevelTable caption="매도" tone="sell" rows={sells} />}
    </div>
  );
}

function LevelTable({ caption, tone, rows }: { caption: string; tone: "buy" | "sell"; rows: Level[] }) {
  const qtyClass = tone === "buy" ? "text-emerald-700" : "text-rose-600";
  return (
    <div>
      <div className="mb-1.5 grid grid-cols-2 px-1 text-[11px] text-stone-400">
        <span>{caption}가</span>
        <span className="text-right">개수</span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((row, i) => (
          <li key={`${caption}-${i}-${row.price}`} className="grid grid-cols-2 rounded-2xl bg-stone-50 px-4 py-2.5 text-[17px] tabular">
            <span className="text-stone-800">{formatPrice(row.price)}</span>
            <span className={`text-right font-semibold ${qtyClass}`}>{formatQty(row.qty)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
