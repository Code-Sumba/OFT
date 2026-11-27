import { describe, expect, it } from "vitest";
import { seedAllRoles, setup } from "./helpers.js";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";

async function batchAtProcessor() {
  const ctx = setup();
  const users = await seedAllRoles(ctx.db, ctx.api);
  const reg = await ctx.api.post("/api/batches").set(users.farmer.auth).send({
    product: "Jowar",
    quantity: 100,
    unit: "kg",
    origin: "Solapur",
    harvestDate: "2026-07-20",
    certificateCid: CID,
  });
  const code: string = reg.body.data.batch.code;
  await ctx.api
    .post(`/api/batches/${code}/certify`)
    .set(users.certifier.auth)
    .send({ approved: true, expiry: `${new Date().getUTCFullYear() + 1}-03-31` });
  await ctx.api.post(`/api/batches/${code}/transfer`).set(users.farmer.auth).send({ toUserId: users.processor.user.id, location: "Pune" });
  return { ...ctx, users, code };
}

describe("GET /api/trace/:code (public)", () => {
  it("shows journey, certificate, trust score and a verified badge without login", async () => {
    const w = await batchAtProcessor();
    const res = await w.api.get(`/api/trace/${w.code.toLowerCase()}`); // codes are case-insensitive for typing
    expect(res.status).toBe(200);
    const d = res.body.data;

    expect(d.batch).toMatchObject({ code: w.code, product: "Jowar", status: "certified", stage: "processor" });
    expect(d.batch.farmer).toEqual({ id: w.users.farmer.user.id, name: "farmer user", organisation: "farmer org", role: "farmer" });
    expect(d.timeline.map((e: { type: string }) => e.type)).toEqual(["registered", "certified", "transferred"]);
    expect(d.timeline[2].tx.url).toMatch(/^https:\/\/amoy\.polygonscan\.com\/tx\/0x[0-9a-f]{64}$/);
    expect(d.trust).toEqual({ score: 100, band: "verified", rules: [] });
    expect(d.verification).toMatchObject({ badge: "verified", chainChecked: true, matchesChain: true, differences: [] });
    expect(d.verification.contract.address).toBe(w.config.CONTRACT_ADDRESS);
    expect(JSON.stringify(d)).not.toContain("@test.local"); // no emails on the public page
  });

  it("detects a tampered database record (R2) and shows a warning", async () => {
    const w = await batchAtProcessor();
    w.trust.invalidate(w.code);
    await w.db.query("UPDATE batch_events SET location = 'Bengaluru' WHERE batch_code = $1 AND event_type = 'transferred'", [w.code]);

    const res = await w.api.get(`/api/trace/${w.code}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.verification).toMatchObject({ badge: "warning", matchesChain: false, differences: ["hand-over 1 differs"] });
    expect(d.trust.score).toBe(70);
    expect(d.trust.rules.map((r: { rule: string }) => r.rule)).toEqual(["R2"]);

    // ...and an admin sees the alert
    const alerts = await w.api.get("/api/admin/fraud-alerts?resolved=false").set(w.users.admin.auth);
    expect(alerts.body.data.alerts).toEqual([expect.objectContaining({ batch_code: w.code, rule: "R2", severity: "high" })]);

    // Fixing the record resolves the alert on the next check
    await w.db.query("UPDATE batch_events SET location = 'Pune' WHERE batch_code = $1 AND event_type = 'transferred'", [w.code]);
    w.trust.invalidate(w.code);
    const fixed = await w.api.get(`/api/trace/${w.code}`);
    expect(fixed.body.data.verification.badge).toBe("verified");
    const after = await w.api.get("/api/admin/fraud-alerts?resolved=false").set(w.users.admin.auth);
    expect(after.body.data.alerts).toEqual([]);
  });

  it("shows a warning and lower score for an uncertified batch", async () => {
    const ctx = setup();
    const users = await seedAllRoles(ctx.db, ctx.api);
    const reg = await ctx.api.post("/api/batches").set(users.farmer.auth).send({
      product: "Ragi",
      quantity: 10,
      unit: "kg",
      origin: "Mandya",
      harvestDate: "2026-07-01",
    });
    const res = await ctx.api.get(`/api/trace/${reg.body.data.batch.code}`);
    expect(res.body.data.verification.badge).toBe("warning");
    expect(res.body.data.trust).toMatchObject({ score: 60, band: "caution", rules: [expect.objectContaining({ rule: "R1" })] });
  });

  it("shows an expired certificate as R3 with a warning", async () => {
    const w = await batchAtProcessor();
    const now = new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000); // two years later
    const report = await w.trust.recompute(w.code, { now });
    expect(report!.rules.map((r) => r.rule)).toEqual(["R3"]);
    expect(report!.score).toBe(75);
  });

  it("rate-limits each visitor separately using the forwarded address", async () => {
    const { api } = setup({ TRACE_RATE_LIMIT_PER_MIN: 2 });
    const hit = (ip: string) => api.get("/api/trace/OT-2026-ZZZZZZ").set("X-Forwarded-For", ip);
    expect((await hit("203.0.113.1")).status).toBe(404);
    expect((await hit("203.0.113.1")).status).toBe(404);
    expect((await hit("203.0.113.1")).status).toBe(429);
    // A different shopper behind the same Next.js server is not affected
    expect((await hit("203.0.113.2")).status).toBe(404);
  });

  it("returns 404 for unknown or malformed codes", async () => {
    const { api } = setup();
    expect((await api.get("/api/trace/OT-2026-ZZZZZZ")).status).toBe(404);
    expect((await api.get("/api/trace/%3Cscript%3E")).status).toBe(404);
  });
});
