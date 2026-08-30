export type Level = {
  price: number;
  qty: number;
};

export type ExtractedSheet = {
  buys: Level[];
  sells: Level[];
  holdings: number;
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
};

export const PRESET_MULTIPLIERS = [9, 1.5, 6] as const;
