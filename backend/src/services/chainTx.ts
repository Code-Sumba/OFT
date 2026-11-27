import { toHttpError } from "../chain/errors.js";
import type { TxResult } from "../chain/types.js";
import type { Db } from "../db.js";
import { applyEvents } from "./events.js";
import type { TrustService } from "./trust.js";

/**
 * Sends a relayer transaction and, once confirmed, applies its events to the
 * database straight away (the indexer would do the same later; both are idempotent).
 * Chain errors are converted to HTTP errors.
 */
export async function sendAndApply(db: Db, trust: TrustService, send: () => Promise<TxResult>): Promise<TxResult> {
  let result: TxResult;
  try {
    result = await send();
  } catch (err) {
    throw toHttpError(err);
  }
  if (result.confirmed) {
    const touched = await applyEvents(db, result.events);
    for (const code of touched) {
      trust.invalidate(code);
      await trust.recompute(code);
    }
  }
  return result;
}
