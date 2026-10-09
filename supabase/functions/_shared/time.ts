// IST helpers. India has no DST, so a fixed +05:30 offset is exact.
// Everything is stored in UTC; these convert for display and for booking-hour math.

export const IST_OFFSET_MS = 330 * 60 * 1000;
export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Wall-clock parts of `d` as seen in Asia/Kolkata. */
export function istParts(d: Date) {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
    dow: t.getUTCDay(),
  };
}

/** "YYYY-MM-DD" for the IST calendar day containing `d`. */
export function istDate(d: Date): string {
  const p = istParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:mm" (24h) IST. */
export function istTime(d: Date): string {
  const p = istParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Parse an IST date ("YYYY-MM-DD") + time ("HH:mm") into a UTC Date. Returns null if malformed. */
export function istToUtc(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, da] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const utc = Date.UTC(y, mo - 1, da, h, mi) - IST_OFFSET_MS;
  const result = new Date(utc);
  // Reject dates like 2026-02-31 that roll over.
  if (istDate(result) !== date) return null;
  return result;
}

/** Day-of-week key for an IST date string. */
export function istDayKey(date: string): DayKey | null {
  const d = istToUtc(date, "12:00");
  return d ? DAY_KEYS[istParts(d).dow] : null;
}

/** Add whole days to an IST date string. */
export function addIstDays(date: string, days: number): string {
  const d = istToUtc(date, "12:00");
  if (!d) throw new Error(`bad date ${date}`);
  return istDate(new Date(d.getTime() + days * 86_400_000));
}

/** "Sat, 10 Oct" */
export function formatIstDay(d: Date): string {
  const p = istParts(d);
  return `${DAY_LABELS[p.dow]}, ${p.day} ${MONTH_LABELS[p.month - 1]}`;
}

/** "10:30 AM" */
export function formatIstClock(d: Date): string {
  const p = istParts(d);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${pad(p.minute)} ${p.hour < 12 ? "AM" : "PM"}`;
}
