import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import LeadAdForm from "../../components/sim/LeadAdForm";
import LeadCard from "../../components/sim/LeadCard";
import OwnerToasts from "../../components/sim/OwnerToasts";
import PhoneChat from "../../components/sim/PhoneChat";
import { demoCall } from "../../lib/demoApi";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOAST_MS = 7000;
const MIN_TYPING_MS = 900; // reads as a person typing on video; the server is usually faster
const BETWEEN_MESSAGES_MS = 650;

const OUTCOME_NOTES = {
  handoff: "Team ko alert chala gaya. AI ab chup hai, insaan reply karega.",
  ai_error: "AI se reply nahi aaya. Team ko alert chala gaya.",
  paused: "AI paused hai. Ye message team dekhegi.",
  opted_out: "Lead ne message band karne ko kaha. Ab koi message nahi jayega.",
};

let localId = 0;
const nextId = (p) => `${p}-${++localId}`;

export default function Simulator() {
  const { slug = "skyline-realty" } = useParams();
  const [org, setOrg] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [lead, setLead] = useState(null);
  const [items, setItems] = useState([]);
  const [typing, setTyping] = useState(false);
  const [toasts, setToasts] = useState([]);
  const run = useRef(0); // invalidates in-flight playback after a reset

  useEffect(() => {
    let live = true;
    demoCall({ action: "org", slug })
      .then((o) => live && setOrg(o))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [slug]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const pushToast = useCallback(
    (alert) => {
      const id = nextId("toast");
      setToasts((t) => [...t.slice(-2), { id, kind: alert.kind, text: alert.text.replace(/^🔔\s*/u, "") }]);
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  /** Play the server's messages in one by one with a typing pause, then the owner alerts. */
  const playback = useCallback(
    async (res, startedAt, myRun) => {
      const wait = MIN_TYPING_MS - (Date.now() - startedAt);
      if (wait > 0) await sleep(wait);
      for (let i = 0; i < res.messages.length; i++) {
        if (run.current !== myRun) return;
        if (i > 0) {
          setTyping(true);
          await sleep(BETWEEN_MESSAGES_MS);
        }
        setTyping(false);
        setItems((xs) => [...xs, res.messages[i]]);
      }
      setTyping(false);
      if (run.current !== myRun) return;
      const note = OUTCOME_NOTES[res.outcome];
      if (note) setItems((xs) => [...xs, { id: nextId("note"), kind: "note", body: note }]);
      setLead(res.lead);
      for (const a of res.alerts ?? []) {
        await sleep(350);
        if (run.current !== myRun) return;
        pushToast(a);
      }
    },
    [pushToast],
  );

  async function submitLead(form) {
    const myRun = ++run.current;
    setBusy(true);
    setError("");
    setStarted(true);
    setItems([]);
    setLead(null);
    setTyping(true);
    const t0 = Date.now();
    try {
      const res = await demoCall({ action: "submit_lead", slug, ...form });
      if (!res.sent) {
        setTyping(false);
        setItems([{ id: nextId("note"), kind: "note", body: "Pehla message nahi gaya. Owner ko alert chala gaya." }]);
      }
      await playback(res, t0, myRun);
    } catch (e) {
      setTyping(false);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Like WhatsApp, the lead can send while a reply is still coming: the bubble shows at once,
  // and messages go to the server one at a time, in order.
  const queue = useRef(Promise.resolve());
  const leadRef = useRef(null);
  leadRef.current = lead;

  async function deliver(text, myRun) {
    const current = leadRef.current;
    if (run.current !== myRun || !current) return;
    setBusy(true);
    const t0 = Date.now();
    // Typing only shows if the business will answer; paused / opted-out leads get silence.
    if (!current.ai_paused && current.status !== "opted_out") setTyping(true);
    try {
      const res = await demoCall({ action: "send", lead_id: current.id, text });
      if (run.current !== myRun) return;
      leadRef.current = res.lead;
      await playback(res, res.messages.length ? t0 : Date.now() - MIN_TYPING_MS, myRun);
    } catch (e) {
      setTyping(false);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function send(text) {
    if (!lead) return;
    const myRun = run.current;
    setError("");
    setItems((xs) => [
      ...xs,
      { id: nextId("me"), direction: "in", sender: "lead", body: text, created_at: new Date().toISOString() },
    ]);
    queue.current = queue.current.then(() => deliver(text, myRun));
  }

  function reset() {
    run.current++;
    queue.current = Promise.resolve();
    setStarted(false);
    setLead(null);
    setItems([]);
    setTyping(false);
    setToasts([]);
    setError("");
    setBusy(false);
  }

  const optedOut = lead?.status === "opted_out" || lead?.status === "invalid_phone";

  return (
    <div className="min-h-dvh">
      <OwnerToasts toasts={toasts} onDismiss={dismiss} />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <p className="font-semibold tracking-tight">FlowDocs AI</p>
        {started && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium hover:border-ink/30"
          >
            <RotateCcw className="size-4" aria-hidden />
            Naya lead
          </button>
        )}
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 pb-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_340px] md:items-start md:gap-10 md:pt-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14">
        <div className="min-w-0 space-y-6 md:max-w-md">
          <div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Form bhara. Seconds me WhatsApp reply.
            </h1>
            <p className="mt-3 text-muted">
              Lead form submit karein, phir apne phone ki tarah chat karein. AI qualify karega, visit book karega,
              aur owner ko har step pe alert jayega.
            </p>
          </div>

          {!started || !lead ? (
            <LeadAdForm org={org} busy={busy} onSubmit={submitLead} />
          ) : (
            <LeadCard lead={lead} />
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="min-w-0 md:sticky md:top-6">
          <div className="mx-auto h-[640px] w-full max-w-[400px] overflow-hidden rounded-[2rem] border border-line shadow-xl sm:h-[760px] sm:rounded-[2.75rem] sm:border-[10px] sm:border-neutral-900 sm:ring-1 sm:ring-line">
            <PhoneChat
              businessName={org?.name ?? "Business"}
              subtitle="virtual assistant"
              items={items}
              typing={typing}
              disabled={!lead || optedOut}
              disabledReason={optedOut ? "Opted out" : !lead ? "Pehle form submit karein" : "Message"}
              onSend={send}
              emptyHint="Form submit karte hi yahan WhatsApp message aayega."
            />
          </div>
        </div>
      </main>
    </div>
  );
}
