import type { ChainBatch, ChainTransfer } from "../chain/types.js";
import type { BatchEventRow, BatchRow } from "../repositories/batches.js";

export interface ChainComparison {
  matches: boolean;
  differences: string[];
}

/**
 * Compares the database copy of a batch with the on-chain record (rule R2).
 * `actorIdOf` maps a user id to their on-chain actor id.
 */
export function compareWithChain(
  batch: BatchRow,
  events: BatchEventRow[],
  chainBatch: ChainBatch | null,
  chainHistory: ChainTransfer[],
  actorIdOf: (userId: string | null) => string | null,
): ChainComparison {
  if (!chainBatch) return { matches: false, differences: ["Batch is missing on the blockchain"] };

  const diffs: string[] = [];
  const eq = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");

  if (!eq(batch.product, chainBatch.product)) diffs.push("product differs");
  if (!eq(batch.origin, chainBatch.origin)) diffs.push("origin differs");
  if (batch.status !== chainBatch.status) diffs.push(`status is ${batch.status} in database but ${chainBatch.status} on-chain`);
  if (batch.stage !== chainBatch.stage) diffs.push(`stage is ${batch.stage} in database but ${chainBatch.stage} on-chain`);
  if (!eq(actorIdOf(batch.farmer_id)?.toLowerCase(), chainBatch.farmerId.toLowerCase())) diffs.push("farmer differs");
  if (!eq(actorIdOf(batch.current_owner_id)?.toLowerCase(), chainBatch.currentOwner.toLowerCase())) {
    diffs.push("current owner differs");
  }
  if (batch.status === "certified") {
    if (!eq(batch.certificate_cid, chainBatch.certificateCID)) diffs.push("certificate differs");
    const dbExpiry = batch.cert_expiry ? new Date(batch.cert_expiry).getTime() : null;
    if (dbExpiry !== (chainBatch.certExpiry?.getTime() ?? null)) diffs.push("certificate expiry differs");
  }

  const moves = events.filter((e) => e.event_type === "transferred" || e.event_type === "sold");
  if (moves.length !== chainHistory.length) {
    diffs.push(`${moves.length} hand-overs in database but ${chainHistory.length} on-chain`);
  } else {
    chainHistory.forEach((t, i) => {
      const e = moves[i];
      if (e.stage !== t.toStage || !eq(e.location, t.location)) diffs.push(`hand-over ${i + 1} differs`);
      else if (t.toStage !== "sold" && !eq(actorIdOf(e.to_user_id)?.toLowerCase(), t.toActor.toLowerCase())) {
        diffs.push(`hand-over ${i + 1} recipient differs`);
      }
    });
  }

  return { matches: diffs.length === 0, differences: diffs };
}
