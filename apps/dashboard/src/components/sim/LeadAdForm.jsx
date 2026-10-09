import { useState } from "react";
import { initials } from "../../lib/demoApi";

// A generic social lead-ad form, the way a buyer sees it. No platform branding.
export default function LeadAdForm({ org, busy, onSubmit }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);

  function submit(e) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || busy) return;
    if (!consent) {
      setConsentError(true);
      return;
    }
    onSubmit({ name: name.trim(), phone: phone.trim(), consent: true });
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      {/* Marks the card as a demo so nobody mistakes it for a real builder's ad. */}
      <p className="mb-4 inline-flex rounded-md border border-line bg-bg px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide text-muted">
        DEMO · sample builder
      </p>
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
          {initials(org?.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight">{org?.name ?? "Loading..."}</p>
          <p className="text-xs text-muted">Demo ad</p>
        </div>
      </div>

      <h2 className="mt-4 text-lg font-semibold leading-snug">{org?.project ?? " "}</h2>
      {org?.project_details && <p className="mt-1 text-sm text-muted">{org.project_details}</p>}

      <div className="mt-5 space-y-3">
        <label className="block">
          <span className="text-sm font-medium">Full name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            autoComplete="name"
            placeholder="Aapka naam"
            className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[15px] outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">WhatsApp number</span>
          <div className="mt-1 flex rounded-lg border border-line bg-bg focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
            <span className="grid place-items-center border-r border-line px-3 font-mono text-sm text-muted">+91</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              inputMode="tel"
              maxLength={16}
              autoComplete="tel-national"
              placeholder="98xxxxxxxx"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-[15px] outline-none"
            />
          </div>
        </label>
      </div>

      <label className="mt-4 flex items-start gap-3 text-sm leading-relaxed text-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            setConsentError(false);
          }}
          aria-invalid={consentError || undefined}
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
        <span>{org?.name ?? "Ye business"} mujhse WhatsApp par contact kar sakta hai.</span>
      </label>
      {consentError && <p className="mt-1 text-sm text-danger">WhatsApp contact ke liye consent tick karein</p>}

      <button
        type="submit"
        disabled={busy || !org}
        className="mt-4 w-full rounded-lg bg-accent px-4 py-3 font-semibold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-60"
      >
        {busy ? "Bhej rahe hain..." : "Submit"}
      </button>
    </form>
  );
}
