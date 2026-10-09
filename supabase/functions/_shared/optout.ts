// Deterministic opt-out detection. Runs before the AI so "STOP" never depends on a model call.
// The agent also has an opt_out tool for paraphrases this list misses.

const EXACT = new Set(["stop", "stop all", "unsubscribe", "band", "बंद", "বন্ধ"]);

const PHRASES = [
  "not interested",
  "no interest",
  "interested nahi",
  "interest nahi",
  "band karo",
  "band kar do",
  "band kardo",
  "mat bhejo",
  "message mat",
  "msg mat",
  "dont message",
  "do not message",
  "stop messaging",
  "stop sending",
  "बंद करो",
  "मैसेज मत",
  "দরকার নেই",
];

export function isOptOut(text: string): boolean {
  const t = text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[.!?,;:"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;
  if (EXACT.has(t)) return true;
  // "STOP" as its own leading word ("stop pls", "STOP!!")
  if (/^stop\b/.test(t) && t.split(" ").length <= 3) return true;
  return PHRASES.some((p) => t.includes(p));
}
