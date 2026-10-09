import { ArrowLeft, CheckCheck, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatClock, initials } from "../../lib/demoApi";

function TypingBubble() {
  return (
    <div className="flex justify-start animate-msg-in" aria-label="typing">
      <div className="flex items-center gap-1 rounded-xl rounded-tl-sm bg-bubble-in px-3.5 py-3 shadow-sm">
        <span className="typing-dot size-1.5 rounded-full bg-chat-meta" />
        <span className="typing-dot size-1.5 rounded-full bg-chat-meta" />
        <span className="typing-dot size-1.5 rounded-full bg-chat-meta" />
      </div>
    </div>
  );
}

function Bubble({ message }) {
  // The phone is the lead's phone: their messages are the green "sent" bubbles on the right.
  const mine = message.direction === "in";
  return (
    <div className={`flex animate-msg-in ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-xl px-2.5 pt-1.5 pb-1 text-[14.5px] leading-snug text-ink shadow-sm ${
          mine ? "rounded-tr-sm bg-bubble-out" : "rounded-tl-sm bg-bubble-in"
        }`}
      >
        <p className="whitespace-pre-line break-words">{message.body}</p>
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-chat-meta">
          <span>{formatClock(message.created_at)}</span>
          {mine && <CheckCheck className="size-3.5 text-sky-500" aria-hidden />}
        </div>
      </div>
    </div>
  );
}

function Note({ children }) {
  return (
    <div className="flex justify-center animate-msg-in">
      <p className="max-w-[88%] rounded-lg bg-note-bg px-3 py-1.5 text-center text-[12.5px] leading-snug text-note-ink shadow-sm">
        {children}
      </p>
    </div>
  );
}

export default function PhoneChat({ businessName, subtitle, items, typing, disabled, disabledReason, onSend, emptyHint }) {
  const [draft, setDraft] = useState("");
  const scroller = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items, typing]);

  function submit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || disabled) return;
    setDraft("");
    onSend(text);
    input.current?.focus();
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-chat-bg">
      <header className="flex items-center gap-3 bg-chat-head px-3 py-2.5 text-chat-head-ink">
        <ArrowLeft className="size-5 shrink-0 opacity-90" aria-hidden />
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-white/20 text-sm font-semibold">
          {initials(businessName)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight">{businessName}</p>
          <p className="truncate text-xs opacity-80">{typing ? "typing..." : subtitle}</p>
        </div>
      </header>

      <div ref={scroller} className="chat-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3" aria-live="polite">
        {items.length === 0 && !typing && (
          <p className="mx-auto mt-10 max-w-[80%] text-center text-sm text-chat-meta">{emptyHint}</p>
        )}
        {items.map((m) => (m.kind === "note" ? <Note key={m.id}>{m.body}</Note> : <Bubble key={m.id} message={m} />))}
        {typing && <TypingBubble />}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 bg-chat-bar px-2 py-2">
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          maxLength={1000}
          placeholder={disabled ? disabledReason : "Message"}
          aria-label="Message"
          className="min-w-0 flex-1 rounded-full bg-bubble-in px-4 py-2.5 text-[15px] text-ink outline-none placeholder:text-chat-meta focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-70"
        />
        <button
          type="submit"
          disabled={disabled || !draft.trim()}
          aria-label="Send"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition-transform active:scale-95 disabled:opacity-50"
        >
          <SendHorizontal className="size-5" aria-hidden />
        </button>
      </form>
    </div>
  );
}
