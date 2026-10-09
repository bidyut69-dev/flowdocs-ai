import { BellRing, X } from "lucide-react";

const TITLES = {
  new_lead: "Owner notified: new lead",
  visit_booked: "Owner notified: visit booked",
  handoff: "Owner notified: handoff",
  opt_out: "Owner notified: opt-out",
  invalid_phone: "Owner notified: invalid phone",
  template_missing: "Owner notified: template missing",
};

export default function OwnerToasts({ toasts, onDismiss }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:w-[340px]"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto w-full animate-toast-in rounded-xl border border-line bg-surface p-3.5 shadow-lg"
        >
          <div className="flex items-start gap-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <BellRing className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{TITLES[t.kind] ?? "Owner notified"}</p>
              <p className="mt-1 whitespace-pre-line break-words font-mono text-[11.5px] leading-relaxed text-muted">
                {t.text}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss"
              className="-m-1 rounded p-1 text-muted hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
