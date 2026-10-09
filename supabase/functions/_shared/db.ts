// Small data-access helpers shared by every function.

import type { Db } from "./supabaseAdmin.ts";
import type { MessageTemplate, OrgConfig, Organization } from "./types.ts";

export class DbError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

/** Unwrap a supabase-js result, throwing on error. */
export function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new DbError(`${what}: ${res.error.message}`, res.error.code);
  if (res.data == null) throw new DbError(`${what}: not found`);
  return res.data;
}

export async function logEvent(
  db: Db,
  orgId: string,
  leadId: string | null,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.from("events").insert({ org_id: orgId, lead_id: leadId, type, payload });
  // The audit log must never break the conversation; surface it in function logs instead.
  if (error) console.error(`events insert failed (${type}):`, error.message);
}

export async function loadOrg(db: Db, by: { id?: string; slug?: string }): Promise<{ org: Organization; config: OrgConfig } | null> {
  let q = db.from("organizations").select("id, name, niche, slug, status");
  q = by.id ? q.eq("id", by.id) : q.eq("slug", by.slug ?? "");
  const { data: org, error } = await q.maybeSingle();
  if (error) throw new DbError(`load org: ${error.message}`, error.code);
  if (!org) return null;
  const config = must(
    await db.from("org_config").select("*").eq("org_id", org.id).maybeSingle(),
    "load org_config",
  ) as OrgConfig;
  return { org: org as Organization, config };
}

/** The approved template for a use case, or null if none is approved. */
export async function approvedTemplate(
  db: Db,
  orgId: string,
  useCase: MessageTemplate["use_case"],
): Promise<MessageTemplate | null> {
  const { data, error } = await db
    .from("message_templates")
    .select("*")
    .eq("org_id", orgId)
    .eq("use_case", useCase)
    .eq("status", "approved")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbError(`load template: ${error.message}`, error.code);
  return data as MessageTemplate | null;
}

export async function cancelPendingFollowups(db: Db, leadId: string): Promise<number> {
  const { data, error } = await db
    .from("followup_jobs")
    .update({ status: "cancelled" })
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .select("id");
  if (error) throw new DbError(`cancel followups: ${error.message}`, error.code);
  return data?.length ?? 0;
}
