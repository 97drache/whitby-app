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
  scaleSellLevels,
  scaleQty,
  scaleUsd,
  buyNotional,
} from "@/lib/calc";
import { formatTradeDate, nextUsTradingDay } from "@/lib/market";
import { NAMED_PRESETS, type ExtractedSheet, type Level } from "@/lib/types";

const KEY_STORAGE = "whitby_gemini_key";
const MULTIPLIER_STORAGE = "whitby_multipliers";
const SHEET_STORAGE = "whitby_sheet";

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

function readStoredSheet(): ExtractedSheet | null {
  try {
    const raw = localStorage.getItem(SHEET_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExtractedSheet;
    if (!parsed || !Array.isArray(parsed.buys) || !Number.isFinite(parsed.holdings)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSheet(value: ExtractedSheet) {
  try {
    localStorage.setItem(SHEET_STORAGE, JSON.stringify(value));
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
  const [hasServerKey, setHasServerKey] = useState(false);
  const skipRemotePushRef = useRef(false);

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
    fetch("/api/parse")
      .then((r) => r.json())
      .then((data: { hasServerKey?: boolean }) => {
        if (data.hasServerKey) setHasServerKey(true);
      })
      .catch(() => {});
    if (!initialSheet) {
      const saved = readStoredSheet();
      if (saved) setSheet(saved);
      fetch("/api/sheet")
        .then((r) => r.json())
        .then((data: { sheet?: ExtractedSheet | null }) => {
          if (data.sheet && Array.isArray(data.sheet.buys) && Number.isFinite(data.sheet.holdings)) {
            skipRemotePushRef.current = true;
            setSheet(data.sheet);
            setSheetKey((n) => n + 1);
            return;
          }
          if (saved) {
            fetch("/api/sheet", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sheet: saved }),
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, [initialSheet]);

  useEffect(() => {
    if (!sheet || initialSheet) return;
    writeStoredSheet(sheet);
    if (skipRemotePushRef.current) {
      skipRemotePushRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      fetch("/api/sheet", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet }),
      }).catch(() => {});
    }, 400);
    return () => window.clearTimeout(timer);
  }, [sheet, initialSheet]);

  async function runParse(imageFile: File) {
    setBusy(true);
    setError(null);
    try {
      const blob = await compressImage(imageFile);
      const form = new FormData();
      form.append("image", blob, "sheet.jpg");
      const key = apiKeyRef.current.trim() || readStoredKey();
      const headers: HeadersInit = {};
      if (key) {
        headers["x-gemini-key"] = key;
        form.append("geminiKey", key);
      }
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
    setError(null);
    await runParse(next);
  }

  const customMultiplier = Number(customRaw);
  const customValid = customRaw.trim() !== "" && Number.isFinite(customMultiplier) && customMultiplier > 0;

  return (
    <main className="relative mx-auto min-h-dvh max-w-[430px]">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#eedfe4]/70 bg-[#f8f2f4]/90 px-4 pb-3 pt-[calc(14px+var(--safe-top))] backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/tulip.png" alt="" className="h-20 w-auto shrink-0 object-contain" />
          <p className="text-[22px] font-semibold tracking-tight text-[#3a2a30]">WHITBY</p>
        </div>
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#8a6f78] ring-1 ring-[#eedfe4]"
        >
          {showKey ? "닫기" : hasServerKey ? "설정" : keySaved ? "설정 · 저장됨" : "설정"}
        </button>
      </header>

      <div className="px-4 pb-[calc(32px+var(--safe-bottom))] pt-4">

      {showKey && (
        <section className="card mb-4 p-4">
          <p className="text-sm font-medium">Gemini API 키</p>
          {hasServerKey ? (
            <p className="mt-1 text-xs leading-relaxed text-[#2a9a74]">
              서버에 키가 설정되어 있어 폰에서 다시 넣을 필요가 없습니다.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs leading-relaxed text-[#8a6f78]">
                Vercel에 GEMINI_API_KEY를 넣으면 이 입력은 필요 없습니다. 임시로 쓸 때만 아래에 넣으세요.
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
            </>
          )}
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
          <div className="px-4 py-5 text-center">
            <span className="text-sm font-semibold">시트 사진 올리기</span>
            <span className="mt-1 block text-xs leading-relaxed text-[#8a6f78]">
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
        <div className="card mb-3 px-4 py-3 text-sm text-[#8a6f78]">매수 · 매도 · 보유 · 종가일을 읽고 있습니다…</div>
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
                <p className="flex flex-wrap items-center gap-2 text-[20px] font-semibold tracking-tight text-[#3a2a30]">
                  {customValid ? <MultiplierMark value={customMultiplier} /> : "배수"}
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

function CycleBanner({ sheet }: { sheet: ExtractedSheet }) {
  const percent = remainingPercent(sheet.cashUsd, sheet.startUsd);
  const tradeDate = nextUsTradingDay(sheet.closeDate);
  return (
    <section className="card mb-4 p-4">
      <p className="text-[11px] text-[#8a6f78]">거래일</p>
      <p className="mt-0.5 text-sm font-semibold text-[#3a2a30]">{formatTradeDate(tradeDate)}</p>
      <div className="mt-3 grid grid-cols-3 text-center">
        <div>
          <p className="text-[11px] text-[#8a6f78]">종가</p>
          <p className="mt-1 text-[15px] font-semibold tabular text-[#3a2a30]">
            {sheet.closePrice != null ? formatPrice(sheet.closePrice) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-[#8a6f78]">보유평단</p>
          <p className="mt-1 text-[15px] font-semibold tabular text-[#15803d]">
            {sheet.avgCost != null ? formatPrice(sheet.avgCost) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-[#8a6f78]">보유 개수</p>
          <p className="mt-1 text-[15px] font-semibold tabular text-[#15803d]">{formatQty(sheet.holdings)}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 text-center">
        <div>
          <p className="text-[11px] text-[#8a6f78]">시작 $</p>
          <p className="mt-1 text-[15px] font-semibold tabular text-[#3a2a30]">
            {sheet.startUsd != null ? formatUsd(sheet.startUsd) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-[#8a6f78]">잔금 $</p>
          <p className="mt-1 text-[15px] font-semibold tabular text-[#3a2a30]">
            {sheet.cashUsd != null ? formatUsd(sheet.cashUsd) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-[#8a6f78]">남은 비율</p>
          <p className="mt-1 text-[15px] font-semibold tabular text-[#c45c78]">
            {percent != null ? `${percent.toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>
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
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-[#8a6f78]">
          종가 날짜
          <input
            type="date"
            value={sheet.closeDate ?? ""}
            onChange={(e) => onChange({ ...sheet, closeDate: e.target.value || null })}
            className="mt-1 w-full rounded-2xl bg-[#fdf7f9] px-2 py-2 text-sm tabular outline-none"
          />
        </label>
        <label className="text-xs text-[#8a6f78]">
          종가
          <NumberField
            value={sheet.closePrice ?? 0}
            inputMode="decimal"
            className="mt-1 w-full rounded-2xl bg-[#fdf7f9] px-2 py-2 text-sm tabular outline-none"
            onChange={(closePrice) => onChange({ ...sheet, closePrice })}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-[#8a6f78]">
          보유평단
          <NumberField
            value={sheet.avgCost ?? 0}
            inputMode="decimal"
            className="mt-1 w-full rounded-2xl bg-[#fdf7f9] px-2 py-2 text-sm tabular outline-none"
            onChange={(avgCost) => onChange({ ...sheet, avgCost })}
          />
        </label>
        <label className="text-xs text-[#8a6f78]">
          보유 개수
          <NumberField
            value={sheet.holdings}
            inputMode="numeric"
            className="mt-1 w-full rounded-2xl bg-[#fdf7f9] px-2 py-2 text-sm tabular outline-none"
            onChange={(holdings) => onChange({ ...sheet, holdings })}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
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
  const accent = tone === "buy" ? "text-[#dc2626]" : "text-[#2563eb]";
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
              className={`rounded-2xl bg-[#fdf7f9] px-3 py-2 text-lg tabular outline-none ring-1 ring-[#eedfe4] ${accent}`}
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

function MultiplierMark({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center rounded-full bg-[#eee6f8] px-2.5 py-[3px] leading-none">
        <span className="text-[17px] font-semibold italic tabular text-[#6d28d9]">{formatMultiplier(value)}</span>
      </span>
      <span className="text-[16px] font-medium not-italic text-[#3a2a30]">배수</span>
    </span>
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
          <h2 className="flex flex-wrap items-center gap-2 text-[20px] font-semibold tracking-tight text-[#3a2a30]">
            {name}
            <MultiplierMark value={multiplier} />
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
        <p className="mb-3 text-[11px] font-medium text-[#c45c78]">
          .5배수는 보유·매수를 누적해 반올림하고, 매도는 낮은가부터 계산합니다.
        </p>
      )}
      <ScaledTable sheet={sheet} multiplier={multiplier} />
    </section>
  );
}

function ScaledTable({ sheet, multiplier }: { sheet: ExtractedSheet; multiplier: number }) {
  const holdings = scaleQty(sheet.holdings, multiplier);
  const buys = useMemo(
    () => scaleLevels(sheet.buys, multiplier, sheet.holdings, "desc"),
    [sheet.buys, multiplier, sheet.holdings],
  );
  const sells = useMemo(
    () => scaleSellLevels(sheet.sells, multiplier, sheet.holdings),
    [sheet.sells, multiplier, sheet.holdings],
  );

  return (
    <div>
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1 py-1">
          <span className="text-[11px] text-[#8a6f78]">보유 개수</span>
          <span className="text-[20px] leading-none tabular font-semibold text-[#3a2a30]">{formatQty(holdings)}</span>
        </div>
        <p className="px-1 text-center text-[13px] font-normal text-[#3a2a30]">Limit VWAP: 일반예약 + 장마감 30분전</p>
        <LevelTable caption="예약매수" tone="buy" rows={buys} />
        {sells.length > 0 && <LevelTable caption="예약매도" tone="sell" rows={sells} />}
      </div>
      <p className="mt-5 text-sm font-semibold tabular text-[#c45c78]">
        매수금 ${formatUsd(buyNotional(buys))}
      </p>
    </div>
  );
}

function LevelTable({ caption, tone, rows }: { caption: string; tone: "buy" | "sell"; rows: Level[] }) {
  const qtyClass = tone === "buy" ? "text-[#dc2626]" : "text-[#2563eb]";
  return (
    <div>
      <div className="mb-1.5 grid grid-cols-2 px-1 text-[11px] text-[#8a6f78]">
        <span>{caption}</span>
        <span className="text-right">개수</span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((row, i) => (
          <li key={`${caption}-${i}-${row.price}`} className="flex items-center justify-between rounded-2xl bg-[#fdf7f9] px-4 py-2.5">
            <span className="text-[18px] tabular font-medium text-black">{formatPrice(row.price)}</span>
            <span className={`text-[20px] leading-none tabular font-semibold ${qtyClass}`}>{formatQty(row.qty)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
