// Claude call + tool loop. Channel-agnostic: the caller supplies tool handlers and gets back
// either a reply to send, or a terminal action (handoff / opt-out) that the caller completes.

import Anthropic from "@anthropic-ai/sdk";

export const CHAT_MODEL = "claude-haiku-5-5";
const MAX_TOOL_ROUNDS = 6;
const RETRY_DELAY_MS = 2_000;

export type Terminal = "handoff" | "opt_out";

export interface ToolOutcome {
  result: unknown; // JSON-serialisable, shown to the model
  terminal?: Terminal; // stop the loop; the caller sends the closing message
  isError?: boolean;
}

export type ToolHandlers = Record<string, (input: Record<string, unknown>) => Promise<ToolOutcome>>;

export interface ToolCallLog {
  name: string;
  input: unknown;
  result: unknown;
}

export interface AgentResult {
  reply: string | null;
  terminal: Terminal | null;
  toolCalls: ToolCallLog[];
}

export class AgentError extends Error {
  constructor(message: string, readonly kind: "api" | "refusal" | "empty" | "loop") {
    super(message);
  }
}

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_available_slots",
    description:
      "List open visit slots for one IST calendar date. Returns slot values to pass to book_appointment and human labels to show the lead. Call before offering any time.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "IST date, YYYY-MM-DD. Must be within the next 14 days." },
      },
      required: ["date"],
      additionalProperties: false,
    },
  },
  {
    name: "book_appointment",
    description:
      "Book a visit in a slot the lead has chosen. Only call after the lead picks one of the times from get_available_slots. Returns ok=true with the confirmed date, time and location, or ok=false with a reason and alternatives.",
    input_schema: {
      type: "object",
      properties: {
        starts_at: { type: "string", description: 'Slot value from get_available_slots, "YYYY-MM-DD HH:mm" in IST.' },
        notes: { type: "string", description: "One short line for the sales team (what they want, who is coming)." },
      },
      required: ["starts_at"],
      additionalProperties: false,
    },
  },
  {
    name: "update_lead",
    description:
      "Save what the lead has told you. Call whenever you learn an answer to a qualification question. Only include fields you actually learned.",
    input_schema: {
      type: "object",
      properties: {
        answers: {
          type: "object",
          description: "Qualification answers keyed by question key (e.g. budget, bhk, timeline, visit_pref), in the lead's words, short.",
          additionalProperties: { type: "string" },
        },
        budget_min_inr: { type: "integer", description: "Lower end of budget in rupees." },
        budget_max_inr: { type: "integer", description: "Upper end of budget in rupees." },
        timeline_months: { type: "number", description: "Months until they want to buy/start. 0 = immediately, 99 = just browsing." },
        summary: { type: "string", description: "One-line summary of the lead for the owner." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "handoff_to_human",
    description:
      "Pause the assistant and alert the team. Use for any handoff rule: human requested, complaint/anger, negotiation, payment/loan/token, legal/refund, or anything not in Business facts. Write no reply yourself after calling this.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["human_requested", "complaint", "negotiation", "payment", "legal_refund", "out_of_scope", "bot_question", "other"],
        },
        reason: { type: "string", description: "One line for the owner explaining why." },
      },
      required: ["category", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "mark_unclear",
    description: "Record that you could not understand the lead's last message. Then ask them briefly to rephrase.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "opt_out",
    description: "The lead wants no more messages. Stops all messaging to this lead. Write no reply after calling this.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // maxRetries 0: SYSTEM_DESIGN §7 wants exactly one retry after 2s, done below.
  client ??= new Anthropic({ maxRetries: 0, timeout: 25_000 });
  return client;
}

function retryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true; // includes timeouts
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.InternalServerError) return true;
  if (err instanceof Anthropic.APIError) return err.status === 529 || err.status === 408;
  return false;
}

async function createWithRetry(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  try {
    return await getClient().messages.create(params);
  } catch (err) {
    if (!retryable(err)) throw new AgentError(`Claude API error: ${(err as Error).message}`, "api");
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    try {
      return await getClient().messages.create(params);
    } catch (err2) {
      throw new AgentError(`Claude API error after retry: ${(err2 as Error).message}`, "api");
    }
  }
}

/** Strip anything WhatsApp would render badly and keep the reply short. */
export function cleanReply(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-•*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function runAgent(opts: {
  system: string;
  messages: Anthropic.MessageParam[];
  handlers: ToolHandlers;
}): Promise<AgentResult> {
  const messages = [...opts.messages];
  const toolCalls: ToolCallLog[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await createWithRetry({
      model: CHAT_MODEL,
      max_tokens: 4096,
      output_config: { effort: "low" },
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      throw new AgentError(`refusal: ${response.stop_details?.category ?? "unknown"}`, "refusal");
    }

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const reply = cleanReply(text);
      if (!reply) throw new AgentError(`empty reply (stop_reason=${response.stop_reason})`, "empty");
      return { reply, terminal: null, toolCalls };
    }

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    let terminal: Terminal | null = null;

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const handler = opts.handlers[block.name];
      let outcome: ToolOutcome;
      try {
        outcome = handler
          ? await handler((block.input ?? {}) as Record<string, unknown>)
          : { result: { error: `unknown tool ${block.name}` }, isError: true };
      } catch (err) {
        outcome = { result: { error: (err as Error).message }, isError: true };
      }
      toolCalls.push({ name: block.name, input: block.input, result: outcome.result });
      if (outcome.terminal) terminal = outcome.terminal;
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(outcome.result),
        is_error: outcome.isError,
      });
    }

    // Handoff / opt-out end the turn: the caller sends the fixed closing message (or nothing).
    if (terminal) return { reply: null, terminal, toolCalls };

    messages.push({ role: "user", content: results });
  }

  throw new AgentError("too many tool rounds", "loop");
}
