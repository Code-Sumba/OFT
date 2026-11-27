import type { ChainClient } from "../chain/types.js";
import { type Db, placeholders } from "../db.js";
import { type BatchEventRow, type BatchRow, findBatch, listEvents, setTrustScore } from "../repositories/batches.js";
import { type FraudResult, evaluateBatch } from "./fraud.js";
import { type ChainComparison, compareWithChain } from "./verify.js";

export interface TrustReport extends FraudResult {
  /** null when the chain could not be reached in time. */
  chain: ChainComparison | null;
}

const CHAIN_TIMEOUT_MS = 2_500;
const CACHE_TTL_MS = 30_000;

/**
 * Runs the fraud engine for a batch, including the on-chain comparison (R2),
 * stores the trust score and opens/resolves fraud alerts to match.
 * Chain comparisons are cached briefly so the public trace page stays fast.
 */
export class TrustService {
  private readonly cache = new Map<string, { at: number; result: ChainComparison }>();

  constructor(
    private readonly db: Db,
    private readonly chain: ChainClient,
  ) {}

  invalidate(batchCode: string) {
    this.cache.delete(batchCode);
  }

  async recompute(batchCode: string, opts: { now?: Date } = {}): Promise<TrustReport | null> {
    const batch = await findBatch(this.db, batchCode);
    if (!batch) return null;
    const events = await listEvents(this.db, batchCode);

    // A batch whose registration is still pending is not compared yet.
    const chain = batch.tx_hash_register && events.length > 0 ? await this.compare(batch, events) : null;

    const result = evaluateBatch({
      status: batch.status,
      certExpiry: batch.cert_expiry ? new Date(batch.cert_expiry) : null,
      transferTimes: events.filter((e) => e.event_type === "transferred").map((e) => new Date(e.event_time)),
      chainMismatch: chain ? !chain.matches : null,
      chainMismatchDetails: chain?.differences,
      now: opts.now,
    });

    await setTrustScore(this.db, batchCode, result.score);
    await this.syncAlerts(batchCode, result, chain !== null);
    return { ...result, chain };
  }

  private async compare(batch: BatchRow, events: BatchEventRow[]): Promise<ChainComparison | null> {
    const hit = this.cache.get(batch.batch_code);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

    try {
      const [chainBatch, history] = await withTimeout(
        Promise.all([this.chain.getBatch(batch.batch_code), this.chain.getHistory(batch.batch_code)]),
        CHAIN_TIMEOUT_MS,
      );

      const userIds = new Set<string>([batch.farmer_id, batch.current_owner_id]);
      for (const e of events) if (e.to_user_id) userIds.add(e.to_user_id);
      const ids = [...userIds];
      const { rows } = await this.db.query<{ id: string; chain_actor_id: string }>(
        `SELECT id, chain_actor_id FROM users WHERE id IN (${placeholders(ids.length)})`,
        ids,
      );
      const actorIds = new Map(rows.map((r) => [r.id, r.chain_actor_id]));

      const result = compareWithChain(batch, events, chainBatch, history, (id) => (id ? actorIds.get(id) ?? null : null));
      this.cache.set(batch.batch_code, { at: Date.now(), result });
      return result;
    } catch (err) {
      console.warn(`Chain comparison for ${batch.batch_code} failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** One open alert per (batch, rule); alerts for rules that no longer apply are resolved. */
  private async syncAlerts(batchCode: string, result: FraudResult, chainChecked: boolean) {
    const { rows: open } = await this.db.query<{ id: number; rule: string }>(
      "SELECT id, rule FROM fraud_alerts WHERE batch_code = $1 AND resolved = false",
      [batchCode],
    );
    const openRules = new Set(open.map((a) => a.rule));
    const active = new Set(result.rules.map((r) => r.rule));

    for (const r of result.rules) {
      if (!openRules.has(r.rule)) {
        await this.db.query(
          "INSERT INTO fraud_alerts (batch_code, rule, severity, details) VALUES ($1, $2, $3, $4)",
          [batchCode, r.rule, r.severity, r.details],
        );
      }
    }
    for (const a of open) {
      // Without a chain check we cannot tell whether R2 has cleared, so leave it open.
      if (!active.has(a.rule as never) && (a.rule !== "R2" || chainChecked)) {
        await this.db.query("UPDATE fraud_alerts SET resolved = true WHERE id = $1", [a.id]);
      }
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
