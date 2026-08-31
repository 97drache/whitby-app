export type Level = {
  price: number;
  qty: number;
};

export type ExtractedSheet = {
  buys: Level[];
  sells: Level[];
  holdings: number;
  avgCost: number | null;
  closeDate: string | null;
  cycle: number | null;
  startUsd: number | null;
  cashUsd: number | null;
};

export type NamedPreset = {
  id: string;
  name: string;
  defaultMultiplier: number;
};

export const SAMPLE_SHEET: ExtractedSheet = {
  buys: [
    { price: 110.66, qty: 9 },
    { price: 111.22, qty: 10 },
  ],
  sells: [
    { price: 127.03, qty: 7 },
    { price: 112.84, qty: 9 },
    { price: 112.5, qty: 8 },
  ],
  holdings: 48,
  avgCost: 115.4,
  closeDate: "2026-08-28",
  cycle: 29,
  startUsd: 14467.67,
  cashUsd: 8777.08,
};

export const NAMED_PRESETS: NamedPreset[] = [
  { id: "miyeong", name: "미영", defaultMultiplier: 9 },
  { id: "rael", name: "레엘", defaultMultiplier: 1.5 },
  { id: "yongwoon", name: "용운", defaultMultiplier: 6 },
];
