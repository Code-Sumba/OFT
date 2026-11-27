import { describe, expect, it } from "vitest";
import { runIndexerOnce } from "../src/services/indexer.js";
import { seedAllRoles, setup } from "./helpers.js";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";

async function flow() {
  const ctx = setup();
  const startBlock = (await ctx.chain.getBlockNumber()) + 1;
  const users = await seedAllRoles(ctx.db, ctx.api);
  const reg = await ctx.api.post("/api/batches").set(users.farmer.auth).send({
    product: "Toor Dal",
    quantity: 40,
    unit: "kg",
    origin: "Latur",
    harvestDate: "2026-08-01",
    certificateCid: CID,
  });
  const code: string = reg.body.data.batch.code;
  await ctx.api
    .post(`/api/batches/${code}/certify`)
    .set(users.certifier.auth)
    .send({ approved: true, expiry: `${new Date().getUTCFullYear() + 1}-01-31` });
  await ctx.api.post(`/api/batches/${code}/transfer`).set(users.farmer.auth).send({ toUserId: users.processor.user.id, location: "Pune" });
  const opts = { deployBlock: startBlock, confirmations: 0, blockChunk: 2 };
  return { ...ctx, users, code, opts };
}

const snapshot = async (db: ReturnType<typeof setup>["db"], code: string) => ({
  batch: (await db.query("SELECT status, stage, current_owner_id, certificate_cid, trust_score FROM batches WHERE batch_code = $1", [code])).rows[0],
  events: (await db.query("SELECT event_type, stage, location, tx_hash, log_index FROM batch_events WHERE batch_code = $1 ORDER BY block_number, log_index", [code])).rows,
  certs: (await db.query("SELECT cid, approved, tx_hash FROM certificates WHERE batch_code = $1", [code])).rows,
});

describe("indexer", () => {
  it("is idempotent: re-applying events the API already stored changes nothing", async () => {
    const w = await flow();
    const before = await snapshot(w.db, w.code);
    expect(before.events).toHaveLength(3);

    const applied = await runIndexerOnce(w.db, w.chain, w.trust, w.opts);
    expect(applied).toBe(3);
    expect(await snapshot(w.db, w.code)).toEqual(before);
  });

  it("rebuilds lost database state from chain events", async () => {
    const w = await flow();
    const expected = await snapshot(w.db, w.code);

    // Simulate the API crashing before it could store anything after sending the transactions
    await w.db.query("DELETE FROM batch_events");
    await w.db.query("DELETE FROM certificates");
    await w.db.query(
      "UPDATE batches SET status = 'registered', stage = 'farmer', current_owner_id = farmer_id, last_block = 0, last_log_index = -1 WHERE batch_code = $1",
      [w.code],
    );

    await runIndexerOnce(w.db, w.chain, w.trust, w.opts);
    expect(await snapshot(w.db, w.code)).toEqual(expected);
  });

  it("never rolls state back when an older event arrives after a newer one", async () => {
    const w = await flow();
    const events = await w.chain.getEvents(w.opts.deployBlock, await w.chain.getBlockNumber());
    const { applyEvents } = await import("../src/services/events.js");
    // Replay in reverse order: the 'registered' event is applied last
    await applyEvents(w.db, [...events].reverse());
    const { rows } = await w.db.query("SELECT stage, status FROM batches WHERE batch_code = $1", [w.code]);
    expect(rows[0]).toEqual({ stage: "processor", status: "certified" });
  });

  it("resumes from the saved block and skips batches it does not know", async () => {
    const w = await flow();
    await runIndexerOnce(w.db, w.chain, w.trust, w.opts);
    const { rows } = await w.db.query("SELECT last_block FROM indexer_state WHERE id = 1");
    expect(Number(rows[0].last_block)).toBe(await w.chain.getBlockNumber());

    // Nothing new: second run applies nothing
    expect(await runIndexerOnce(w.db, w.chain, w.trust, w.opts)).toBe(0);

    // A different database (e.g. another environment) sees an unknown batch and skips it without failing
    const other = setup();
    await expect(runIndexerOnce(other.db, other.chain, other.trust, w.opts)).resolves.toBe(3);
    expect((await other.db.query("SELECT COUNT(*)::int AS n FROM batch_events")).rows[0].n).toBe(0);
  });
});
