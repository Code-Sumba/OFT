import { describe, expect, it } from "vitest";
import { seedAllRoles, seedUser, setup } from "./helpers.js";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const nextYear = () => `${new Date().getUTCFullYear() + 1}-06-30`;

const newBatch = {
  product: "Basmati Rice",
  quantity: 250,
  unit: "kg",
  origin: "Dehradun, Uttarakhand",
  harvestDate: "2026-09-15",
  certificateCid: CID,
};

async function world() {
  const ctx = setup();
  const users = await seedAllRoles(ctx.db, ctx.api);
  return { ...ctx, users };
}

async function registered(w: Awaited<ReturnType<typeof world>>) {
  const res = await w.api.post("/api/batches").set(w.users.farmer.auth).send(newBatch);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.batch.code as string;
}

async function certified(w: Awaited<ReturnType<typeof world>>) {
  const code = await registered(w);
  const res = await w.api.post(`/api/batches/${code}/certify`).set(w.users.certifier.auth).send({ approved: true, expiry: nextYear() });
  if (res.status !== 200) throw new Error(`certify failed: ${res.status} ${JSON.stringify(res.body)}`);
  return code;
}

describe("batch lifecycle through the API", () => {
  it("registers on-chain, certifies, transfers to retailer and sells", async () => {
    const w = await world();
    const { farmer, certifier, processor, distributor, retailer } = w.users;

    // Register
    const reg = await w.api.post("/api/batches").set(farmer.auth).send(newBatch);
    expect(reg.status).toBe(201);
    const code: string = reg.body.data.batch.code;
    expect(code).toMatch(/^OT-\d{4}-[A-Z2-9]{6}$/);
    expect(reg.body.data.batch).toMatchObject({ status: "registered", stage: "farmer", onChain: true, trustScore: 60 });
    expect(reg.body.data.tx).toMatchObject({ confirmed: true, url: expect.stringContaining("amoy.polygonscan.com/tx/0x") });

    const onChain = await w.chain.getBatch(code);
    expect(onChain).toMatchObject({ product: "Basmati Rice", status: "registered", stage: "farmer", farmerId: farmer.user.chain_actor_id });

    // Certify
    const cert = await w.api.post(`/api/batches/${code}/certify`).set(certifier.auth).send({ approved: true, expiry: nextYear() });
    expect(cert.status).toBe(200);
    expect(cert.body.data.batch).toMatchObject({ status: "certified", trustScore: 100 });
    expect(cert.body.data.batch.certificate).toMatchObject({ cid: CID, expired: false, url: `https://gateway.example/ipfs/${CID}` });

    // Farmer -> Processor -> Distributor -> Retailer
    const hops = [
      [farmer, processor, "Haridwar", "processor"],
      [processor, distributor, "Delhi", "distributor"],
      [distributor, retailer, "Mumbai", "retailer"],
    ] as const;
    for (const [from, to, location, stage] of hops) {
      const t = await w.api.post(`/api/batches/${code}/transfer`).set(from.auth).send({ toUserId: to.user.id, location });
      expect(t.status, `${from.user.role} -> ${to.user.role}`).toBe(200);
      expect(t.body.data.batch).toMatchObject({ stage, currentOwner: { id: to.user.id } });
    }

    // Sell
    const sold = await w.api.post(`/api/batches/${code}/sold`).set(retailer.auth).send({ location: "Organic Mart, Pune" });
    expect(sold.status).toBe(200);
    expect(sold.body.data.batch.stage).toBe("sold");

    // Detail view has the full, ordered event history and the certificate record
    const detail = await w.api.get(`/api/batches/${code}`).set(farmer.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.data.events.map((e: { type: string; stage: string | null }) => `${e.type}:${e.stage}`)).toEqual([
      "registered:farmer",
      "certified:null",
      "transferred:processor",
      "transferred:distributor",
      "transferred:retailer",
      "sold:sold",
    ]);
    expect(detail.body.data.events[2]).toMatchObject({ location: "Haridwar", from: { id: farmer.user.id }, to: { id: processor.user.id } });
    expect(detail.body.data.events[2].from).not.toHaveProperty("email");
    expect(detail.body.data.certificates).toEqual([
      expect.objectContaining({ approved: true, cid: CID, certifier: expect.objectContaining({ id: certifier.user.id }) }),
    ]);

    expect((await w.chain.getHistory(code)).map((h) => h.location)).toEqual(["Haridwar", "Delhi", "Mumbai", "Organic Mart, Pune"]);
  });

  it("rejection blocks transfers and scores 40", async () => {
    const w = await world();
    const code = await registered(w);
    const rej = await w.api.post(`/api/batches/${code}/certify`).set(w.users.certifier.auth).send({ approved: false });
    expect(rej.status).toBe(200);
    expect(rej.body.data.batch).toMatchObject({ status: "rejected", trustScore: 40 });

    const t = await w.api
      .post(`/api/batches/${code}/transfer`)
      .set(w.users.farmer.auth)
      .send({ toUserId: w.users.processor.user.id, location: "Haridwar" });
    expect(t.status).toBe(409);
  });
});

describe("batch rules and permissions", () => {
  it("only farmers can register; input is validated", async () => {
    const w = await world();
    expect((await w.api.post("/api/batches").set(w.users.processor.auth).send(newBatch)).status).toBe(403);
    expect((await w.api.post("/api/batches").send(newBatch)).status).toBe(401);

    const bad = await w.api
      .post("/api/batches")
      .set(w.users.farmer.auth)
      .send({ ...newBatch, quantity: -1, unit: "bags", certificateCid: "not-a-cid" });
    expect(bad.status).toBe(400);
    expect(bad.body.details.map((d: { field: string }) => d.field).sort()).toEqual(["certificateCid", "quantity", "unit"]);

    const futureHarvest = await w.api.post("/api/batches").set(w.users.farmer.auth).send({ ...newBatch, harvestDate: "2099-01-01" });
    expect(futureHarvest.status).toBe(400);
  });

  it("only certifiers certify; approval needs a future expiry and a certificate", async () => {
    const w = await world();
    const code = await registered(w);
    const url = `/api/batches/${code}/certify`;

    expect((await w.api.post(url).set(w.users.farmer.auth).send({ approved: true, expiry: nextYear() })).status).toBe(403);
    expect((await w.api.post(url).set(w.users.certifier.auth).send({ approved: true, expiry: "2020-01-01" })).status).toBe(400);
    expect((await w.api.post(url).set(w.users.certifier.auth).send({ approved: true })).status).toBe(400);

    const noCert = await w.api.post("/api/batches").set(w.users.farmer.auth).send({ ...newBatch, certificateCid: undefined });
    const noCertCode = noCert.body.data.batch.code;
    const r = await w.api.post(`/api/batches/${noCertCode}/certify`).set(w.users.certifier.auth).send({ approved: true, expiry: nextYear() });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/certificate file is required/);

    const withOwn = await w.api
      .post(`/api/batches/${noCertCode}/certify`)
      .set(w.users.certifier.auth)
      .send({ approved: true, expiry: nextYear(), certificateCid: CID });
    expect(withOwn.status).toBe(200);
  });

  it("cannot transfer before certification", async () => {
    const w = await world();
    const code = await registered(w);
    const t = await w.api
      .post(`/api/batches/${code}/transfer`)
      .set(w.users.farmer.auth)
      .send({ toUserId: w.users.processor.user.id, location: "Haridwar" });
    expect(t.status).toBe(409);
    expect(t.body.error).toMatch(/certified/);
  });

  it("cannot transfer once the certificate has expired, until it is renewed", async () => {
    const w = await world();
    const code = await certified(w);
    // Simulate the certificate running out (the chain only checks it at certification time).
    await w.db.query("UPDATE batches SET cert_expiry = $2 WHERE batch_code = $1", [code, new Date(Date.now() - 86_400_000)]);
    const send = () =>
      w.api.post(`/api/batches/${code}/transfer`).set(w.users.farmer.auth).send({ toUserId: w.users.processor.user.id, location: "Haridwar" });

    const blocked = await send();
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/expired/);

    const renew = await w.api.post(`/api/batches/${code}/certify`).set(w.users.certifier.auth).send({ approved: true, expiry: nextYear() });
    expect(renew.status).toBe(200);
    expect((await send()).status).toBe(200);
  });

  it("only the current holder can transfer, and only to the next role", async () => {
    const w = await world();
    const code = await certified(w);
    const url = `/api/batches/${code}/transfer`;

    // Skipping a stage: farmer straight to retailer
    const skip = await w.api.post(url).set(w.users.farmer.auth).send({ toUserId: w.users.retailer.user.id, location: "Mumbai" });
    expect(skip.status).toBe(400);
    expect(skip.body.error).toBe("Recipient must be a processor");

    // Someone who does not hold the batch
    const other = await w.api.post(url).set(w.users.processor.auth).send({ toUserId: w.users.distributor.user.id, location: "Delhi" });
    expect(other.status).toBe(403);

    // Another farmer
    const farmer2 = await seedUser(w.db, "farmer", "approved", "farmer2@test.local");
    const login = await w.api.post("/api/auth/login").send({ email: farmer2.email, password: "correct-horse-1" });
    const f2 = await w.api
      .post(url)
      .set("Authorization", `Bearer ${login.body.data.token}`)
      .send({ toUserId: w.users.processor.user.id, location: "Haridwar" });
    expect(f2.status).toBe(403);

    // Unapproved recipient
    const pendingProc = await seedUser(w.db, "processor", "pending");
    const pend = await w.api.post(url).set(w.users.farmer.auth).send({ toUserId: pendingProc.id, location: "Haridwar" });
    expect(pend.status).toBe(400);
  });

  it("the contract is the final guard: a stale database still cannot skip a stage", async () => {
    const w = await world();
    const code = await certified(w);
    // Make the database claim the batch is already at the distributor, owned by the distributor
    await w.db.query("UPDATE batches SET stage = 'distributor', current_owner_id = $2 WHERE batch_code = $1", [
      code,
      w.users.distributor.user.id,
    ]);
    const t = await w.api
      .post(`/api/batches/${code}/transfer`)
      .set(w.users.distributor.auth)
      .send({ toUserId: w.users.retailer.user.id, location: "Mumbai" });
    expect(t.status).toBe(409);
    expect(t.body.details).toEqual({ contractError: "InvalidStageTransition" });
  });

  it("only the holding retailer can mark sold, and only at retailer stage", async () => {
    const w = await world();
    const code = await certified(w);
    const s = await w.api.post(`/api/batches/${code}/sold`).set(w.users.retailer.auth).send({ location: "Shop" });
    expect(s.status).toBe(403);
  });

  it("lists batches by role visibility and supports search", async () => {
    const w = await world();
    const code = await certified(w);
    await w.api
      .post(`/api/batches/${code}/transfer`)
      .set(w.users.farmer.auth)
      .send({ toUserId: w.users.processor.user.id, location: "Haridwar" });
    await registered(w); // a second, uncertified batch

    const list = async (auth: { Authorization: string }, qs = "") =>
      (await w.api.get(`/api/batches${qs}`).set(auth)).body.data.batches.map((b: { code: string }) => b.code);

    expect(await list(w.users.farmer.auth)).toHaveLength(2);
    expect(await list(w.users.certifier.auth)).toHaveLength(2);
    expect(await list(w.users.processor.auth)).toEqual([code]);
    expect(await list(w.users.distributor.auth)).toEqual([]);
    expect(await list(w.users.farmer.auth, "?status=certified")).toEqual([code]);
    expect(await list(w.users.farmer.auth, `?q=${code.slice(-4).toLowerCase()}`)).toEqual([code]);
    expect(await list(w.users.farmer.auth, "?q=wheat")).toEqual([]);
  });

  it("lists approved recipients by role without emails", async () => {
    const w = await world();
    await seedUser(w.db, "processor", "pending");
    const res = await w.api.get("/api/users?role=processor").set(w.users.farmer.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.users).toEqual([
      { id: w.users.processor.user.id, name: "processor user", organisation: "processor org", role: "processor" },
    ]);
  });
});

describe("QR code", () => {
  it("returns a PNG (or SVG) pointing at the trace page for the holding retailer or admin", async () => {
    const w = await world();
    const code = await certified(w);
    for (const [from, to, loc] of [
      ["farmer", "processor", "Haridwar"],
      ["processor", "distributor", "Delhi"],
      ["distributor", "retailer", "Mumbai"],
    ] as const) {
      await w.api.post(`/api/batches/${code}/transfer`).set(w.users[from].auth).send({ toUserId: w.users[to].user.id, location: loc });
    }

    const png = await w.api.get(`/api/batches/${code}/qr`).set(w.users.retailer.auth).buffer(true);
    expect(png.status).toBe(200);
    expect(png.headers["content-type"]).toBe("image/png");
    expect(png.body.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const svg = await w.api.get(`/api/batches/${code}/qr?format=svg`).set(w.users.admin.auth);
    expect(svg.status).toBe(200);
    expect(svg.headers["content-type"]).toMatch(/image\/svg\+xml/);

    expect((await w.api.get(`/api/batches/${code}/qr`).set(w.users.farmer.auth)).status).toBe(403);
  });
});

describe("admin analytics and gas report", () => {
  it("summarises users, batches, alerts and daily activity", async () => {
    const w = await world();
    const code = await certified(w);
    await w.api.post(`/api/batches/${code}/transfer`).set(w.users.farmer.auth).send({ toUserId: w.users.processor.user.id, location: "Haridwar" });
    await registered(w);

    const res = await w.api.get("/api/admin/analytics").set(w.users.admin.auth);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.users.byRole).toMatchObject({ admin: 1, farmer: 1, certifier: 1 });
    expect(d.batches).toMatchObject({ total: 2, byStatus: { certified: 1, registered: 1 }, byStage: { processor: 1, farmer: 1 }, averageTrustScore: 80 });
    expect(d.openAlerts).toEqual({ high: 1 }); // R1 on the uncertified batch
    expect(d.daily).toHaveLength(14);
    expect(d.daily.at(-1)).toMatchObject({ registered: 2, certified: 1, transferred: 1, sold: 0 });

    expect((await w.api.get("/api/admin/analytics").set(w.users.farmer.auth)).status).toBe(403);
  });

  it("serves the generated gas report", async () => {
    const w = await world();
    const res = await w.api.get("/api/admin/gas-report").set(w.users.admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.report.lifecycle.savingPct).toBeGreaterThan(0);
  });
});
