import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Anon key only. Service role and WhatsApp tokens never reach the browser.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const supabaseConfigError = supabase
  ? null
  : "VITE_SUPABASE_URL aur VITE_SUPABASE_ANON_KEY set nahi hain (apps/dashboard/.env).";
