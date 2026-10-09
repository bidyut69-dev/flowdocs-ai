import { supabase, supabaseConfigError } from "./supabase";

/** Call the demo-chat Edge Function. Throws Error with a user-readable message. */
export async function demoCall(body) {
  if (!supabase) throw new Error(supabaseConfigError);
  const { data, error } = await supabase.functions.invoke("demo-chat", { body });
  if (error) {
    let message = "Server se jawab nahi aaya. Dobara try karein.";
    try {
      const payload = await error.context?.json();
      if (payload?.error) message = payload.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  return data;
}

const clock = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "10:42 am" in IST, as WhatsApp shows it. */
export function formatClock(iso) {
  return clock.format(new Date(iso)).toLowerCase();
}

export function initials(name = "") {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "?"
  );
}
