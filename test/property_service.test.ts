import assert from "node:assert/strict";
import { test } from "node:test";
import { instructionFor, startService } from "../src/property_service.js";
import { InfraiError, setMonthlyCeiling } from "../src/spend_ceiling.js";

test("monthly ceiling is confirmed before any property request can be served", async () => {
  let calls = 0;
  await assert.rejects(
    startService("test-key", 25, 0, async () => { calls++; throw new InfraiError("REJECTED", 400, "Cap rejected"); }),
    InfraiError,
  );
  assert.equal(calls, 1);
  assert.match(instructionFor({ kind: "inspection_reminder", propertyId: "P1", unit: "4B", detail: "Friday" }), /scheduling/);
});

test("budget rejection is decoded before HTTP status and a 429 waits before retry", async () => {
  let calls = 0;
  const request: typeof fetch = async (_url, options) => {
    calls++;
    assert.equal(options?.method, "PUT");
    assert.deepEqual(JSON.parse(String(options?.body)), { hard_cap_usd: 25, period: "monthly" });
    return new Response(JSON.stringify(calls === 1
      ? { ok: false, error: { code: "RATE_LIMITED", message: "Slow down" } }
      : { ok: true, data: {} }), { status: calls === 1 ? 429 : 200, headers: { "Retry-After": "2" } });
  };
  const waits: number[] = [];
  await setMonthlyCeiling("test-key", 25, request, async ms => { waits.push(ms); });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2000]);
});
