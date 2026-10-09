// What the owner's dashboard knows about this lead, updating live as the chat goes.

import { Flame, Lock, Snowflake, Thermometer } from "lucide-react";

const STATUS_STYLE = {
  new: "bg-line text-ink",
  contacted: "bg-line text-ink",
  qualified: "bg-accent-soft text-accent",
  booked: "bg-accent text-accent-ink",
  opted_out: "bg-danger/15 text-danger",
  invalid_phone: "bg-danger/15 text-danger",
};

const PRIORITY = {
  hot: { label: "Hot", Icon: Flame, badge: "bg-hot-soft text-hot", bar: "bg-hot" },
  warm: { label: "Warm", Icon: Thermometer, badge: "bg-warm-soft text-warm", bar: "bg-warm" },
  cold: { label: "Cold", Icon: Snowflake, badge: "bg-cold-soft text-cold", bar: "bg-cold" },
};

const LABELS = { bhk: "BHK", visit_pref: "Visit day" };
const label = (k) => LABELS[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ");

function PriorityBadge({ priority, locked }) {
  const p = PRIORITY[priority] ?? PRIORITY.cold;
  return (
    <span
      // Re-mounts when priority changes, so the pop plays once per change.
      key={priority}
      className={`animate-msg-in inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${p.badge}`}
      title={locked ? "Owner ne priority lock ki hai" : "Score se auto"}
    >
      <p.Icon className="size-3.5" aria-hidden />
      {p.label}
      {locked && <Lock className="size-3" aria-label="locked" />}
    </span>
  );
}

export default function LeadCard({ lead }) {
  const answers = Object.entries(lead.qualification?.answers ?? {}).filter(([, v]) => v);
  const visit = lead.qualification?.visit_slot;
  const priority = PRIORITY[lead.priority] ? lead.priority : "cold";

  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm" aria-label="Lead in dashboard">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate font-semibold">{lead.name}</h2>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[lead.status] ?? "bg-line text-ink"}`}>
          {lead.status.replace("_", " ")}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Score</span>
          <span className="flex items-center gap-2">
            <PriorityBadge priority={priority} locked={lead.priority_locked} />
            <span className="font-mono font-medium tabular-nums">{lead.score}</span>
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className={`h-full origin-left rounded-full transition-transform duration-500 ${PRIORITY[priority].bar}`}
            style={{ transform: `scaleX(${Math.min(100, lead.score) / 100})` }}
          />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {answers.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{label(k)}</dt>
            <dd className="min-w-0 truncate">{v}</dd>
          </div>
        ))}
        <dt className="text-muted">Visit</dt>
        <dd>{visit || "Not booked"}</dd>
        <dt className="text-muted">AI</dt>
        <dd className={lead.ai_paused ? "font-medium text-danger" : ""}>
          {lead.ai_paused ? "Paused, team handles it" : "Replying"}
        </dd>
      </dl>
    </section>
  );
}
