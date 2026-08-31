/** US equity session dates as UTC midnight YYYY-MM-DD. */

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = utcDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function nthWeekday(year: number, monthIndex: number, weekday: number, n: number): Date {
  const first = utcDate(year, monthIndex, 1);
  const day = 1 + ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7;
  return utcDate(year, monthIndex, day);
}

function lastWeekday(year: number, monthIndex: number, weekday: number): Date {
  const last = utcDate(year, monthIndex + 1, 0);
  const day = last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
  return utcDate(year, monthIndex, day);
}

function observed(year: number, monthIndex: number, day: number): Date {
  const d = utcDate(year, monthIndex, day);
  const wd = d.getUTCDay();
  if (wd === 6) d.setUTCDate(d.getUTCDate() - 1);
  if (wd === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Anonymous Gregorian computus → Easter Sunday UTC. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month - 1, day);
}

function nyseHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const goodFriday = utcDate(year, easter.getUTCMonth(), easter.getUTCDate() - 2);
  return new Set(
    [
      observed(year, 0, 1),
      nthWeekday(year, 0, 1, 3),
      nthWeekday(year, 1, 1, 3),
      goodFriday,
      lastWeekday(year, 4, 1),
      observed(year, 5, 19),
      observed(year, 6, 4),
      nthWeekday(year, 8, 1, 1),
      nthWeekday(year, 10, 4, 4),
      observed(year, 11, 25),
    ].map(toIso),
  );
}

export function isUsTradingDay(d: Date): boolean {
  const wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  return !nyseHolidays(d.getUTCFullYear()).has(toIso(d));
}

/** First NYSE session strictly after the close date on the sheet. */
export function nextUsTradingDay(closeIso: string | null | undefined): string | null {
  const start = parseIsoDate(closeIso);
  if (!start) return null;
  const d = utcDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1);
  for (let i = 0; i < 14; i++) {
    if (isUsTradingDay(d)) return toIso(d);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function formatTradeDate(iso: string | null | undefined): string {
  const d = parseIsoDate(iso);
  if (!d) return "—";
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}
