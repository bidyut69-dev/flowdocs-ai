// Visit slots = org booking_hours (IST) chopped into slot_minutes, minus booked appointments,
// minus anything too close to now.

import { istDayKey, istToUtc } from "./time.ts";

export type BookingHours = Partial<Record<string, [string, string][]>>;

export interface BookedRange {
  starts_at: Date;
  ends_at: Date;
}

export interface SlotInput {
  date: string; // IST "YYYY-MM-DD"
  bookingHours: BookingHours;
  slotMinutes: number;
  booked: BookedRange[];
  now: Date;
  minLeadMinutes?: number; // don't offer a slot starting sooner than this
}

export interface Slot {
  starts_at: Date;
  ends_at: Date;
}

export function computeSlots(input: SlotInput): Slot[] {
  const { date, bookingHours, slotMinutes, booked, now } = input;
  const minLead = (input.minLeadMinutes ?? 60) * 60_000;
  const dayKey = istDayKey(date);
  if (!dayKey || slotMinutes <= 0) return [];

  const windows = bookingHours[dayKey] ?? [];
  const slotMs = slotMinutes * 60_000;
  const slots: Slot[] = [];

  for (const [open, close] of windows) {
    const start = istToUtc(date, open);
    const end = istToUtc(date, close);
    if (!start || !end || end <= start) continue;

    for (let t = start.getTime(); t + slotMs <= end.getTime(); t += slotMs) {
      const s = new Date(t);
      const e = new Date(t + slotMs);
      if (s.getTime() < now.getTime() + minLead) continue;
      const clashes = booked.some((b) => s < b.ends_at && b.starts_at < e);
      if (!clashes) slots.push({ starts_at: s, ends_at: e });
    }
  }

  return slots.sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
}
