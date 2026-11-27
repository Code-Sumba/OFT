import type { ChainClient } from "../chain/types.js";
import type { Db } from "../db.js";
import { applyEvents } from "./events.js";
import type { TrustService } from "./trust.js";

export interface IndexerOptions {
  deployBlock: number;
  confirmations: number;
  blockChunk: number;
}

async function lastProcessedBlock(db: Db, deployBlock: number): Promise<number> {
  await db.query("INSERT INTO indexer_state (id, last_block) VALUES (1, $1) ON CONFLICT (id) DO NOTHING", [
    Math.max(0, deployBlock - 1),
  ]);
  const { rows } = await db.query<{ last_block: string | number }>("SELECT last_block FROM indexer_state WHERE id = 1");
  return Number(rows[0].last_block);
}

/**
 * Processes all confirmed blocks since the last run, in chunks, saving progress
 * after each chunk so a restart resumes where it stopped.
 * Returns the number of batch events applied.
 */
export async function runIndexerOnce(db: Db, chain: ChainClient, trust: TrustService, opts: IndexerOptions): Promise<number> {
  let from = (await lastProcessedBlock(db, opts.deployBlock)) + 1;
  const head = (await chain.getBlockNumber()) - opts.confirmations;
  let applied = 0;

  while (from <= head) {
    const to = Math.min(head, from + opts.blockChunk - 1);
    const events = await chain.getEvents(from, to);
    const touched = await applyEvents(db, events);
    for (const code of touched) {
      trust.invalidate(code);
      await trust.recompute(code);
    }
    await db.query("UPDATE indexer_state SET last_block = $1 WHERE id = 1", [to]);
    applied += events.length;
    from = to + 1;
  }
  return applied;
}
