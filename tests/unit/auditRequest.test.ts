import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatAuditEmail,
  isHoneypotFilled,
  validateAuditRequest,
} from "../../supabase/functions/_shared/auditRequest.ts";

const good = {
  name: "  Amit   Roy ",
  business_name: "Roy Builders",
  phone: "98300 12345",
  email: "amit@roybuilders.in",
  city: "Kolkata",
  niche: "Real estate",
  monthly_leads: "100-300",
  message: "Facebook ads chalate hain",
  source: { utm_source: "instagram", evil: "x" },
  consent: true,
};

describe("validateAuditRequest", () => {
  it("accepts a good request and normalizes it", () => {
    const v = validateAuditRequest(good);
    assert.ok(v.ok);
    assert.equal(v.value.name, "Amit Roy");
    assert.equal(v.value.phone, "+919830012345");
    assert.deepEqual(v.value.source, { utm_source: "instagram" }, "unknown source keys are dropped");
  });

  it("optional fields become null", () => {
    const v = validateAuditRequest({ ...good, email: "", city: " ", message: "" });
    assert.ok(v.ok);
    assert.equal(v.value.email, null);
    assert.equal(v.value.city, null);
    assert.equal(v.value.message, null);
  });

  const bad: [string, Record<string, unknown>, string][] = [
    ["missing name", { ...good, name: "" }, "name"],
    ["missing business", { ...good, business_name: "" }, "business_name"],
    ["bad phone", { ...good, phone: "12345" }, "phone"],
    ["bad email", { ...good, email: "amit@" }, "email"],
    ["unknown niche", { ...good, niche: "Casino" }, "niche"],
    ["unknown lead bucket", { ...good, monthly_leads: "lots" }, "monthly_leads"],
    ["missing consent", { ...good, consent: undefined }, "consent"],
    ["consent as a string", { ...good, consent: "true" }, "consent"],
  ];
  for (const [label, body, field] of bad) {
    it(`rejects ${label}`, () => {
      const v = validateAuditRequest(body);
      assert.equal(v.ok, false);
      if (!v.ok) assert.equal(v.field, field);
    });
  }

  it("honeypot", () => {
    assert.equal(isHoneypotFilled({ website: "spam.com" }), true);
    assert.equal(isHoneypotFilled({ website: "" }), false);
    assert.equal(isHoneypotFilled({}), false);
  });

  it("email text has the essentials", () => {
    const v = validateAuditRequest(good);
    assert.ok(v.ok);
    const e = formatAuditEmail({ ...v.value, created_at: "2026-10-09T10:30:00Z" });
    assert.equal(e.subject, "Audit request: Roy Builders (Real estate)");
    assert.match(e.text, /WhatsApp: \+919830012345/);
    assert.match(e.text, /Fri, 9 Oct, 4:00 PM IST/);
    assert.match(e.text, /utm_source=instagram/);
  });
});
