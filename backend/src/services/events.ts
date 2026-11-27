import type { ChainEvent } from "../chain/types.js";
import type { Db } from "../db.js";

/**
 * Applies contract events to the database cache. Used both by the API (with the
 * events from its own confirmed transaction) and by the indexer, so it must be
 * idempotent and order-safe:
 *  - batch_events / certificates rows are unique per transaction, duplicates are ignored;
 *  - batch state only changes if the event is newer than the last one applied.
 *
 * Returns the batch codes whose state may have changed.
 */
export async function applyEvents(db: Db, events: ChainEvent[]): Promise<Set<string>> {
  const touched = new Set<string>();
  const actorCache = new Map<string, string | null>();

  const userIdFor = async (actorId: string): Promise<string | null> => {
    const key = actorId.toLowerCase();
    if (!actorCache.has(key)) {
      const { rows } = await db.query<{ id: string }>("SELECT id FROM users WHERE chain_actor_id = $1", [key]);
      actorCache.set(key, rows[0]?.id ?? null);
    }
    return actorCache.get(key)!;
  };

  for (const ev of events) {
    const { rows } = await db.query<{ batch_code: string }>("SELECT batch_code FROM batches WHERE batch_code = $1", [
      ev.batchCode,
    ]);
    if (!rows[0]) {
      // Registered outside this backend (or by another deployment sharing the contract).
      console.warn(`applyEvents: skipping ${ev.type} for unknown batch ${ev.batchCode} (tx ${ev.txHash})`);
      continue;
    }

    /** Update batch state only if this event is newer than the last applied one. */
    const advance = async (set: string, values: unknown[]) => {
      const offset = values.length;
      await db.query(
        `UPDATE batches SET ${set}${set ? ", " : ""}last_block = $${offset + 2}, last_log_index = $${offset + 3}
         WHERE batch_code = $${offset + 1}
           AND (last_block < $${offset + 2} OR (last_block = $${offset + 2} AND last_log_index < $${offset + 3}))`,
        [...values, ev.batchCode, ev.blockNumber, ev.logIndex],
      );
    };

    const insertEvent = (type: string, fromUser: string | null, toUser: string | null, stage: string | null, location: string | null) =>
      db.query(
        `INSERT INTO batch_events (batch_code, event_type, from_user_id, to_user_id, stage, location, tx_hash, log_index, block_number, event_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (tx_hash, log_index) DO NOTHING`,
        [ev.batchCode, type, fromUser, toUser, stage, location, ev.txHash, ev.logIndex, ev.blockNumber, ev.timestamp],
      );

    switch (ev.type) {
      case "registered": {
        await db.query("UPDATE batches SET tx_hash_register = $2 WHERE batch_code = $1 AND tx_hash_register IS NULL", [
          ev.batchCode,
          ev.txHash,
        ]);
        await advance("", []);
        await insertEvent("registered", null, await userIdFor(ev.farmerId), "farmer", null);
        break;
      }
      case "certified": {
        const certifier = await userIdFor(ev.certifierId);
        if (ev.approved) {
          await advance("status = 'certified', certificate_cid = $1, cert_expiry = $2", [ev.certCID || null, ev.expiry]);
        } else {
          await advance("status = 'rejected', cert_expiry = NULL", []);
        }
        await insertEvent(ev.approved ? "certified" : "rejected", certifier, null, null, null);
        if (certifier) {
          await db.query(
            `INSERT INTO certificates (batch_code, cid, certifier_id, approved, expiry, tx_hash, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (tx_hash) DO NOTHING`,
            [ev.batchCode, ev.certCID || null, certifier, ev.approved, ev.expiry, ev.txHash, ev.timestamp],
          );
        }
        break;
      }
      case "transferred": {
        const from = await userIdFor(ev.fromActor);
        const to = await userIdFor(ev.toActor);
        if (to) await advance("stage = $1, current_owner_id = $2", [ev.toStage, to]);
        else await advance("stage = $1", [ev.toStage]);
        await insertEvent("transferred", from, to, ev.toStage, ev.location);
        break;
      }
      case "sold": {
        const { rows: owner } = await db.query<{ current_owner_id: string }>(
          "SELECT current_owner_id FROM batches WHERE batch_code = $1",
          [ev.batchCode],
        );
        await advance("stage = 'sold'", []);
        await insertEvent("sold", owner[0]?.current_owner_id ?? null, null, "sold", ev.location);
        break;
      }
    }
    touched.add(ev.batchCode);
  }
  return touched;
}
