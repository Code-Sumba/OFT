import { HttpError } from "../lib/http.js";

/** The contract rejected the call with a custom error (e.g. InvalidStageTransition). */
export class ChainRevertError extends Error {
  constructor(
    public readonly errorName: string,
    public readonly args: string[] = [],
  ) {
    super(`Contract reverted: ${errorName}${args.length ? `(${args.join(", ")})` : ""}`);
  }
}

/** RPC unreachable, out of gas funds, etc. */
export class ChainUnavailableError extends Error {}

const REVERT_MESSAGES: Record<string, [number, string]> = {
  BatchAlreadyExists: [409, "This batch is already registered on the blockchain"],
  BatchNotFound: [404, "Batch not found on the blockchain"],
  BatchNotCertified: [409, "Batch must be certified before it can be transferred"],
  BatchAlreadySold: [409, "Batch has already been sold"],
  InvalidStageTransition: [409, "Batches can only move one stage forward"],
  NotAtRetailer: [409, "Only a batch at the retailer can be marked as sold"],
  ExpiryNotInFuture: [400, "Certificate expiry must be in the future"],
  EmptyField: [400, "A required field is empty"],
  StringTooLong: [400, "A field is too long"],
  ZeroActor: [400, "Invalid participant"],
  Unauthorized: [500, "The relayer wallet is not authorised on the contract"],
};

/** Turn chain errors into API errors; anything else is rethrown unchanged. */
export function toHttpError(err: unknown): unknown {
  if (err instanceof ChainRevertError) {
    const [status, message] = REVERT_MESSAGES[err.errorName] ?? [409, "The blockchain rejected this action"];
    return new HttpError(status, message, { contractError: err.errorName });
  }
  if (err instanceof ChainUnavailableError) {
    console.error("Chain error:", err.message);
    return new HttpError(502, "Blockchain network is unavailable, please try again shortly");
  }
  return err;
}
