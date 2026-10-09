// Outbound channel adapter. Same conversation logic for demo and live (DECISIONS §C);
// only this adapter changes. Phase 2 adds a WhatsApp Cloud API implementation.

import { logEvent, must } from "./db.ts";
import type { Db } from "./supabaseAdmin.ts";
import type { Lead, MessageRow, OrgConfig } from "./types.ts";

export interface Outbound {
  body: string;
  sender: "ai" | "system" | "human";
  templateName?: string | null; // set for business-initiated (template) messages
}

export interface OwnerAlert {
  kind: string;
  text: string;
  at: string;
}

export interface Channel {
  readonly kind: "demo" | "whatsapp";
  send(lead: Lead, msg: Outbound): Promise<MessageRow>;
  notifyOwner(config: OrgConfig, leadId: string | null, kind: string, text: string): Promise<void>;
}

/** Demo channel: writes to the DB exactly like live would, and collects what to show in the simulator. */
export class DemoChannel implements Channel {
  readonly kind = "demo" as const;
  readonly outbox: MessageRow[] = [];
  readonly alerts: OwnerAlert[] = [];

  constructor(private readonly db: Db) {}

  async send(lead: Lead, msg: Outbound): Promise<MessageRow> {
    const row = must(
      await this.db
        .from("messages")
        .insert({
          org_id: lead.org_id,
          lead_id: lead.id,
          direction: "out",
          sender: msg.sender,
          body: msg.body,
          template_name: msg.templateName ?? null,
          status: "demo_delivered",
        })
        .select()
        .single(),
      "insert outbound message",
    ) as MessageRow;
    this.outbox.push(row);
    return row;
  }

  async notifyOwner(config: OrgConfig, leadId: string | null, kind: string, text: string): Promise<void> {
    await logEvent(this.db, config.org_id, leadId, "owner_alert", {
      kind,
      text,
      channel: "demo",
      to: config.owner_whatsapp,
    });
    this.alerts.push({ kind, text, at: new Date().toISOString() });
  }
}
