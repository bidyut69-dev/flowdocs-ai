// Normalize a phone number to E.164. Default country is India (+91).
// Returns null when the input can't be turned into a plausible number.

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export function normalizePhone(raw: string | null | undefined, defaultCountryCode = "91"): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);

  if (s.startsWith("+")) {
    const digits = s.slice(1);
    if (!/^\d{8,15}$/.test(digits)) return null;
    if (digits.startsWith("91") && !INDIAN_MOBILE.test(digits.slice(2))) return null;
    return "+" + digits;
  }

  if (!/^\d+$/.test(s)) return null;

  if (defaultCountryCode === "91") {
    if (INDIAN_MOBILE.test(s)) return "+91" + s;
    if (s.length === 11 && s.startsWith("0") && INDIAN_MOBILE.test(s.slice(1))) return "+91" + s.slice(1);
    if (s.length === 12 && s.startsWith("91") && INDIAN_MOBILE.test(s.slice(2))) return "+" + s;
    return null;
  }

  if (s.startsWith(defaultCountryCode) && s.length >= 8 && s.length <= 15) return "+" + s;
  if (s.length >= 6 && s.length + defaultCountryCode.length <= 15) return "+" + defaultCountryCode + s.replace(/^0+/, "");
  return null;
}
