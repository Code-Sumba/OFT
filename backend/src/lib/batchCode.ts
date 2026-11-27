import { randomInt } from "node:crypto";

// No 0/O, 1/I/L: codes get read aloud and typed from printed labels.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** e.g. OT-2026-7KQ3MZ */
export function newBatchCode(now = new Date()): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `OT-${now.getUTCFullYear()}-${suffix}`;
}

export const BATCH_CODE_PATTERN = /^[A-Z0-9-]{3,40}$/;
