import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";

// Must match NICHES / LEAD_BUCKETS in supabase/functions/_shared/auditRequest.ts
const NICHES = [
  "Real estate",
  "IVF / fertility clinic",
  "Hair transplant clinic",
  "Dental clinic",
  "Coaching institute",
  "Study abroad consultant",
  "Other",
];
const LEAD_BUCKETS = ["100 se kam", "100-300", "300-1000", "1000 se zyada"];

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-request`;
// Run the function next to the database (see apps/dashboard/src/lib/demoApi.js).
const REGION = import.meta.env.VITE_SUPABASE_FUNCTIONS_REGION;

function pageSource() {
  const params = new URLSearchParams(window.location.search);
  const source = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    if (params.get(k)) source[k] = params.get(k);
  }
  if (document.referrer) source.referrer = document.referrer;
  return source;
}

const inputClass =
  "mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-muted/70 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 aria-[invalid=true]:border-danger";

function Field({ label, optional, error, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-sm text-danger">{error}</span>}
    </label>
  );
}

export default function Audit() {
  const [form, setForm] = useState({
    name: "",
    business_name: "",
    phone: "",
    email: "",
    city: "",
    niche: "",
    monthly_leads: "",
    message: "",
    consent: false,
    website: "", // honeypot
  });
  const [status, setStatus] = useState("idle"); // idle | sending | done
  const [error, setError] = useState({ message: "", field: "" });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const invalid = (k) => (error.field === k ? true : undefined);

  async function submit(e) {
    e.preventDefault();
    if (status === "sending") return;
    if (!form.consent) {
      setError({ message: "Contact ke liye consent tick karein", field: "consent" });
      return;
    }
    setStatus("sending");
    setError({ message: "", field: "" });
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(REGION ? { "x-region": REGION } : {}) },
        body: JSON.stringify({ ...form, source: pageSource() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ message: data.error || "Kuch gadbad ho gayi. Dobara try karein.", field: data.field || "" });
        setStatus("idle");
        return;
      }
      setStatus("done");
    } catch {
      setError({ message: "Network issue. Internet check karke dobara try karein.", field: "" });
      setStatus("idle");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 pt-6 pb-16 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,460px)] md:gap-12 md:pt-12 lg:gap-20">
        <div className="min-w-0">
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-5xl">
            Free Lead Leak Audit
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted">
            Hum dekhenge ki aapke ad leads kahan chhoot rahe hain, aur unhe kaise bachaya ja sakta hai.
          </p>
          <ul className="mt-8 max-w-md space-y-3.5 text-[15px]">
            {[
              "Aapke leads ko pehla reply kitni der me jaata hai",
              "Kitne leads bina follow-up ke reh jaate hain",
              "Aapke business ke liye WhatsApp AI ka live demo",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-0.5 size-4.5 shrink-0 text-accent" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          {status === "done" ? (
            <div className="rounded-xl border border-line bg-surface p-6 sm:p-8" role="status">
              <div className="grid size-10 place-items-center rounded-full bg-accent text-accent-ink">
                <Check className="size-5" aria-hidden />
              </div>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">Request mil gayi, {form.name.split(" ")[0]}.</h2>
              <p className="mt-2 text-muted">Hum jaldi aapko WhatsApp par contact karenge.</p>
              <a href="/" className="mt-6 inline-block text-sm font-medium text-accent hover:underline">
                Home par wapas jayein
              </a>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Aapka naam" error={invalid("name") && error.message}>
                  <input value={form.name} onChange={set("name")} required maxLength={80} autoComplete="name"
                    aria-invalid={invalid("name")} className={inputClass} />
                </Field>
                <Field label="Business ka naam" error={invalid("business_name") && error.message}>
                  <input value={form.business_name} onChange={set("business_name")} required maxLength={120}
                    autoComplete="organization" aria-invalid={invalid("business_name")} className={inputClass} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="WhatsApp number" error={invalid("phone") && error.message}>
                  <div className="mt-1.5 flex rounded-lg border border-line bg-bg focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
                    <span className="grid place-items-center border-r border-line px-3 text-sm text-muted">+91</span>
                    <input value={form.phone} onChange={set("phone")} required inputMode="tel" maxLength={16}
                      autoComplete="tel-national" aria-invalid={invalid("phone")}
                      className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[15px] outline-none" />
                  </div>
                </Field>
                <Field label="City" optional>
                  <input value={form.city} onChange={set("city")} maxLength={60} autoComplete="address-level2"
                    className={inputClass} />
                </Field>
              </div>

              <Field label="Email" optional error={invalid("email") && error.message}>
                <input type="email" value={form.email} onChange={set("email")} maxLength={120} autoComplete="email"
                  aria-invalid={invalid("email")} className={inputClass} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business type" error={invalid("niche") && error.message}>
                  <select value={form.niche} onChange={set("niche")} required aria-invalid={invalid("niche")}
                    className={inputClass}>
                    <option value="" disabled>Chuniye</option>
                    {NICHES.map((n) => <option key={n}>{n}</option>)}
                  </select>
                </Field>
                <Field label="Har mahine kitne leads" error={invalid("monthly_leads") && error.message}>
                  <select value={form.monthly_leads} onChange={set("monthly_leads")} required
                    aria-invalid={invalid("monthly_leads")} className={inputClass}>
                    <option value="" disabled>Chuniye</option>
                    {LEAD_BUCKETS.map((n) => <option key={n}>{n}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Abhi leads ko reply kaise karte hain?" optional>
                <textarea value={form.message} onChange={set("message")} rows={3} maxLength={1000}
                  className={`${inputClass} resize-y`} />
              </Field>

              {/* Honeypot: hidden from people, bots fill it. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
                </label>
              </div>

              <div>
                <label className="flex items-start gap-3 text-sm leading-relaxed text-muted">
                  <input
                    type="checkbox"
                    checked={form.consent}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, consent: e.target.checked }));
                      if (error.field === "consent") setError({ message: "", field: "" });
                    }}
                    aria-invalid={invalid("consent")}
                    className="mt-0.5 size-4 shrink-0 accent-accent"
                  />
                  <span>
                    FlowDocs mujhse WhatsApp, call ya email par contact kar sakta hai. Details:{" "}
                    <a href="/legal#privacy" className="underline hover:text-ink">Privacy policy</a>.
                  </span>
                </label>
                {invalid("consent") && <span className="mt-1 block text-sm text-danger">{error.message}</span>}
              </div>

              {error.message && !error.field && (
                <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error.message}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "sending"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3.5 text-[15px] font-semibold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-60"
              >
                {status === "sending" ? "Bhej rahe hain..." : "Audit book karein"}
                {status !== "sending" && <ArrowRight className="size-4" aria-hidden />}
              </button>

            </form>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
