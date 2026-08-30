"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compressImage } from "@/lib/compress";
import {
  formatMultiplier,
  formatPrice,
  formatQty,
  formatUsd,
  remainingPercent,
  scaleLevels,
  scaleQty,
  scaleUsd,
} from "@/lib/calc";
import { NAMED_PRESETS, type ExtractedSheet, type Level } from "@/lib/types";

const KEY_STORAGE = "whitby_gemini_key";
const MULTIPLIER_STORAGE = "whitby_multipliers";

function readStoredKey(): string {
  try {
    return (localStorage.getItem(KEY_STORAGE) || "").trim();
  } catch {
    return "";
  }
}

function writeStoredKey(value: string) {
  try {
    const trimmed = value.trim();
    if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Private browsing can block localStorage.
  }
}

function defaultMultipliers(): Record<string, number> {
  return Object.fromEntries(NAMED_PRESETS.map((p) => [p.id, p.defaultMultiplier]));
}

function readStoredMultipliers(): Record<string, number> {
  const defaults = defaultMultipliers();
  try {
    const raw = localStorage.getItem(MULTIPLIER_STORAGE);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const preset of NAMED_PRESETS) {
      const n = Number(parsed[preset.id]);
      if (Number.isFinite(n) && n > 0) defaults[preset.id] = n;
    }
    return defaults;
  } catch {
    return defaults;
  }
}

function writeStoredMultipliers(value: Record<string, number>) {
  try {
    localStorage.setItem(MULTIPLIER_STORAGE, JSON.stringify(value));
  } catch {
    // Private browsing can block localStorage.
  }
}

export default function WhitbyApp({ initialSheet = null }: { initialSheet?: ExtractedSheet | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const apiKeyRef = useRef("");
  const [preview, setPreview] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ExtractedSheet | null>(initialSheet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(initialSheet ? "sample" : null);
  const [customRaw, setCustomRaw] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const [multipliers, setMultipliers] = useState<Record<string, number>>(defaultMultipliers);

  function rememberKey(value: string) {
    setApiKey(value);
    apiKeyRef.current = value.trim();
    writeStoredKey(value);
    setKeySaved(value.trim().length > 0);
  }

  function saveMultiplier(id: string, value: number) {
    setMultipliers((prev) => {
      const next = { ...prev, [id]: value };
      writeStoredMultipliers(next);
      return next;
    });
  }

  useEffect(() => {
    const stored = readStoredKey();
    setApiKey(stored);
    apiKeyRef.current = stored;
    setKeySaved(stored.length > 0);
    setMultipliers(readStoredMultipliers());
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
      const key = apiKeyRef.current.trim() || readStoredKey();
      const headers: HeadersInit = {};
      if (key) headers["x-gemini-key"] = key;
      const res = await fetch("/api/parse", { method: "POST", body: form, headers });
      const data = (await res.json()) as { sheet?: ExtractedSheet; model?: string; error?: string };
      if (!res.ok || !data.sheet) throw new Error(data.error || "추출에 실패했습니다.");
      setSheet(data.sheet);
      setSheetKey((n) => n + 1);
      setShowSource(false);
      setModelUsed(data.model || null);
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
    <main className="relative mx-auto min-h-dvh max-w-[430px]">
      <TulipWatermark />
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#eedfe4]/70 bg-[#f8f2f4]/90 px-4 pb-3 pt-[calc(14px+var(--safe-top))] backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2.5">
          <TulipMark />
          <p className="text-[22px] font-semibold tracking-tight text-[#3a2a30]">Whitby</p>
        </div>
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#8a6f78] ring-1 ring-[#eedfe4]"
        >
          {showKey ? "닫기" : keySaved ? "설정 · 저장됨" : "설정"}
        </button>
      </header>

      <div className="px-4 pb-[calc(32px+var(--safe-bottom))] pt-4">

      {showKey && (
        <section className="card mb-4 p-4">
          <p className="text-sm font-medium">Gemini API 키</p>
          <p className="mt-1 text-xs leading-relaxed text-[#8a6f78]">
            이 폰에만 저장되며 한 번 넣으면 다시 묻지 않습니다. 사진은 서버에 남기지 않습니다.
          </p>
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => rememberKey(e.target.value)}
            placeholder="AIza..."
            className="mt-3 w-full rounded-2xl bg-[#fdf7f9] px-3 py-2.5 text-sm outline-none ring-1 ring-[#eedfe4] focus:ring-[#c45c78]"
          />
          <p className={`mt-2 text-xs ${keySaved ? "text-[#2a9a74]" : "text-[#8a6f78]"}`}>
            {keySaved ? "이 기기에 저장되어 있습니다." : "키를 입력하면 바로 저장됩니다."}
          </p>
        </section>
      )}

      {sheet && <CycleBanner sheet={sheet} />}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="card mb-3 block w-full overflow-hidden text-left"
      >
        {preview ? (
          <div className="flex items-center gap-3 p-3">
            <img src={preview} alt="올린 시트" className="h-16 w-16 rounded-2xl object-cover ring-1 ring-[#eedfe4]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{busy ? "숫자를 읽는 중…" : "시트 사진"}</p>
              <p className="text-xs text-[#8a6f78]">탭해서 다른 사진으로 바꾸기 · 저장하지 않음</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f8e9ee]">
              <TulipMark size={36} />
            </span>
            <span className="mt-4 text-base font-semibold">시트 사진 올리기</span>
            <span className="mt-1 text-xs leading-relaxed text-[#8a6f78]">
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
        <div className="card mb-3 px-4 py-3 text-sm text-[#8a6f78]">매수 · 매도 · 보유 · 사이클을 읽고 있습니다…</div>
      )}

      {error && (
        <div className="mb-3 rounded-3xl bg-rose-50 px-4 py-3 text-sm text-rose-600 ring-1 ring-rose-100">{error}</div>
      )}

      {sheet && (
        <div className="space-y-3">
          {NAMED_PRESETS.map((preset) => (
            <MultiplierCard
              key={preset.id}
              name={preset.name}
              multiplier={multipliers[preset.id] ?? preset.defaultMultiplier}
              sheet={sheet}
              onSave={(value) => saveMultiplier(preset.id, value)}
            />
          ))}

          <section className="card p-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-[#8a6f78]">추가</p>
                <p className="text-[20px] font-semibold tracking-tight text-[#3a2a30]">
                  {customValid ? `${formatMultiplier(customMultiplier)}배수` : "배수"}
                </p>
                {customValid && (
                  <ScaledCash cashUsd={sheet.cashUsd} multiplier={customMultiplier} />
                )}
              </div>
              <input
                inputMode="decimal"
                value={customRaw}
                onChange={(e) => setCustomRaw(e.target.value)}
                placeholder="예: 3"
                className="w-24 rounded-2xl bg-[#fdf7f9] px-3 py-2 text-right text-lg tabular outline-none ring-1 ring-[#eedfe4] focus:ring-[#c45c78]"
              />
            </div>
            {customValid ? (
              <ScaledTable sheet={sheet} multiplier={customMultiplier} />
            ) : (
              <p className="text-xs text-[#8a6f78]">배수를 넣으면 바로 계산합니다.</p>
            )}
          </section>

          <button type="button" onClick={() => setShowSource((v) => !v)} className="w-full py-2 text-center text-xs text-[#8a6f78]">
            {showSource ? "읽어온 값 접기" : "읽어온 값 수정"}
          </button>

          {showSource && (
            <ExtractedEditor key={sheetKey} sheet={sheet} modelUsed={modelUsed} onChange={setSheet} />
          )}
        </div>
      )}
      </div>
    </main>
  );
}

function TulipMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden className="shrink-0">
      <path d="M24 44V22" stroke="#6B9A6A" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M24 36c-6 1.5-10 6-11 11" stroke="#6B9A6A" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24 34c5 2 9 7 10 12" stroke="#6B9A6A" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24 8c-7 6-11 13-8 18 4 6 8 6 8 6s4 0 8-6c3-5-1-12-8-18Z" fill="#D46A86" />
      <path d="M24 8c-2 8-1 16 0 22" stroke="#F3C3D0" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function TulipWatermark() {
  return (
    <svg
      className="pointer-events-none absolute -right-8 top-16 h-56 w-56 opacity-[0.11]"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
    >
      <path d="M24 44V22" stroke="#C45C78" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M24 36c-6 1.5-10 6-11 11" stroke="#C45C78" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24 34c5 2 9 7 10 12" stroke="#C45C78" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24 8c-7 6-11 13-8 18 4 6 8 6 8 6s4 0 8-6c3-5-1-12-8-18Z" fill="#C45C78" />
    </svg>
  );
}

function CycleBanner({ sheet }: { sheet: ExtractedSheet }) {
  const percent = remainingPercent(sheet.cashUsd, sheet.startUsd);
  return (
    <section className="card mb-4 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-[#3a2a30]">
          현사이클 {sheet.cycle != null ? `${formatQty(sheet.cycle)}차` : "—"}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#8a6f78]">
        <div className="rounded-2xl bg-[#fdf7f9] px-3 py-2">
          <p>시작 $</p>
          <p className="mt-0.5 text-[15px] font-medium tabular text-[#3a2a30]">
            {sheet.startUsd != null ? formatUsd(sheet.startUsd) : "—"}
          </p>
        </div>
        <div className="rounded-2xl bg-[#fdf7f9] px-3 py-2">
          <p>잔금 $</p>
          <p className="mt-0.5 text-[15px] font-medium tabular text-[#3a2a30]">
            {sheet.cashUsd != null ? formatUsd(sheet.cashUsd) : "—"}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[32px] font-semibold leading-none tabular text-[#c45c78]">
        {percent != null ? `${percent.toFixed(1)}%` : "—"}
        <span className="ml-1 text-sm font-medium text-[#8a6f78]">남음</span>
      </p>
    </section>
  );
}

function ScaledCash({ cashUsd, multiplier }: { cashUsd: number | null; multiplier: number }) {
  const scaled = scaleUsd(cashUsd, multiplier);
  return (
    <p className="mt-1 text-sm font-semibold tabular text-[#c45c78]">
      잔금 ${scaled != null ? formatUsd(scaled) : "—"}
    </p>
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
        <p className="text-sm text-[#8a6f78]">숫자를 고치면 배수도 바로 바뀝니다.</p>
        {modelUsed && modelUsed !== "sample" && (
          <span className="rounded-full bg-[#fdf7f9] px-2 py-0.5 text-[10px] text-[#8a6f78]">{modelUsed}</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-[#8a6f78]">
          차수
          <NumberField
            value={sheet.cycle ?? 0}
            inputMode="numeric"
            className="mt-1 w-full rounded-2xl bg-[#fdf7f9] px-2 py-2 text-sm tabular outline-none"
            onChange={(cycle) => onChange({ ...sheet, cycle })}
          />
        </label>
        <label className="text-xs text-[#8a6f78]">
          시작 $
          <NumberField
            value={sheet.startUsd ?? 0}
            inputMode="decimal"
            className="mt-1 w-full rounded-2xl bg-[#fdf7f9] px-2 py-2 text-sm tabular outline-none"
            onChange={(startUsd) => onChange({ ...sheet, startUsd })}
          />
        </label>
        <label className="text-xs text-[#8a6f78]">
          잔금 $
          <NumberField
            value={sheet.cashUsd ?? 0}
            inputMode="decimal"
            className="mt-1 w-full rounded-2xl bg-[#fdf7f9] px-2 py-2 text-sm tabular outline-none"
            onChange={(cashUsd) => onChange({ ...sheet, cashUsd })}
          />
        </label>
      </div>
      <div>
        <p className="mb-2 text-xs text-[#8a6f78]">현재 보유 개수</p>
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
        <button type="button" onClick={() => onChange([...levels, { price: 0, qty: 0 }])} className="text-[11px] text-[#8a6f78]">
          행 추가
        </button>
      </div>
      <div className="mb-1 grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-[11px] text-[#8a6f78]">
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
              className="rounded-2xl bg-[#fdf7f9] px-3 py-2 text-sm tabular outline-none ring-1 ring-[#eedfe4]"
              onChange={(price) => {
                const next = [...levels];
                next[i] = { ...level, price };
                onChange(next);
              }}
            />
            <NumberField
              value={level.qty}
              inputMode="numeric"
              className="rounded-2xl bg-[#fdf7f9] px-3 py-2 text-sm tabular outline-none ring-1 ring-[#eedfe4]"
              onChange={(qty) => {
                const next = [...levels];
                next[i] = { ...level, qty };
                onChange(next);
              }}
            />
            <button type="button" onClick={() => onChange(levels.filter((_, idx) => idx !== i))} className="px-2 text-xs text-[#8a6f78]">
              삭제
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MultiplierCard({
  name,
  multiplier,
  sheet,
  onSave,
}: {
  name: string;
  multiplier: number;
  sheet: ExtractedSheet;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(multiplier));

  useEffect(() => {
    setDraft(String(multiplier));
  }, [multiplier]);

  function save() {
    const n = Number(draft.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return;
    onSave(n);
    setEditing(false);
  }

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight text-[#3a2a30]">
            {name} ({formatMultiplier(multiplier)}배수)
          </h2>
          <ScaledCash cashUsd={sheet.cashUsd} multiplier={multiplier} />
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-full bg-[#fdf7f9] px-3 py-1 text-[11px] font-medium text-[#c45c78]"
          >
            배수 변경
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <input
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-16 rounded-xl bg-[#fdf7f9] px-2 py-1 text-right text-sm tabular outline-none ring-1 ring-[#eedfe4]"
            />
            <button type="button" onClick={save} className="rounded-full bg-[#c45c78] px-3 py-1 text-[11px] font-medium text-white">
              저장
            </button>
          </div>
        )}
      </div>
      {!Number.isInteger(multiplier) && (
        <p className="mb-3 text-[11px] font-medium text-[#c45c78]">개수는 반올림합니다.</p>
      )}
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
      <div className="mb-1.5 grid grid-cols-2 px-1 text-[11px] text-[#8a6f78]">
        <span>{caption}가</span>
        <span className="text-right">개수</span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((row, i) => (
          <li key={`${caption}-${i}-${row.price}`} className="grid grid-cols-2 rounded-2xl bg-[#fdf7f9] px-4 py-2.5 text-[17px] tabular">
            <span className="text-[#3a2a30]">{formatPrice(row.price)}</span>
            <span className={`text-right font-semibold ${qtyClass}`}>{formatQty(row.qty)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
