/**
 * Rule-based fraud engine (TRD section 9). Pure: takes facts, returns score and rules.
 *
 * R5 (rejected) supersedes R1 (uncertified): a rejected batch scores 40, not 0,
 * so "rejected" and "never reviewed" stay distinguishable.
 */

export type RuleId = "R1" | "R2" | "R3" | "R4" | "R5";
export type Severity = "medium" | "high";
export type TrustBand = "verified" | "caution" | "suspicious";

export interface TriggeredRule {
  rule: RuleId;
  label: string;
  severity: Severity;
  impact: number;
  details: string;
}

export interface FraudInput {
  status: "registered" | "certified" | "rejected";
  certExpiry: Date | null;
  /** Times of transfer events (not registration/certification/sale). */
  transferTimes: Date[];
  /** true = DB and chain disagree, false = they match, null = chain not checked. */
  chainMismatch: boolean | null;
  chainMismatchDetails?: string[];
  now?: Date;
}

export interface FraudResult {
  score: number;
  band: TrustBand;
  rules: TriggeredRule[];
}

export const RAPID_WINDOW_MS = 60 * 60 * 1000;
export const RAPID_MAX_TRANSFERS = 3;
const RAPID_PENALTY_EACH = 10;
const RAPID_PENALTY_MAX = 20;

/** Largest number of transfers that fall inside any single window. */
export function maxTransfersInWindow(times: Date[], windowMs = RAPID_WINDOW_MS): number {
  const t = times.map((d) => d.getTime()).sort((a, b) => a - b);
  let best = 0;
  let start = 0;
  for (let end = 0; end < t.length; end++) {
    while (t[end] - t[start] > windowMs) start++;
    best = Math.max(best, end - start + 1);
  }
  return best;
}

export function bandFor(score: number): TrustBand {
  if (score >= 80) return "verified";
  if (score >= 50) return "caution";
  return "suspicious";
}

export function evaluateBatch(input: FraudInput): FraudResult {
  const now = input.now ?? new Date();
  const rules: TriggeredRule[] = [];

  if (input.status === "rejected") {
    rules.push({
      rule: "R5",
      label: "Rejected by certifier",
      severity: "high",
      impact: 60,
      details: "A certifier rejected this batch's organic status.",
    });
  } else if (input.status === "registered") {
    rules.push({
      rule: "R1",
      label: "Not certified",
      severity: "high",
      impact: 40,
      details: "This batch has no approved organic certification.",
    });
  }

  if (input.chainMismatch === true) {
    rules.push({
      rule: "R2",
      label: "Records do not match blockchain",
      severity: "high",
      impact: 30,
      details: input.chainMismatchDetails?.length
        ? input.chainMismatchDetails.join("; ")
        : "Database history differs from the on-chain history.",
    });
  }

  if (input.status === "certified" && input.certExpiry && input.certExpiry.getTime() < now.getTime()) {
    rules.push({
      rule: "R3",
      label: "Certificate expired",
      severity: "high",
      impact: 25,
      details: `Certificate expired on ${input.certExpiry.toISOString().slice(0, 10)}.`,
    });
  }

  const burst = maxTransfersInWindow(input.transferTimes);
  if (burst > RAPID_MAX_TRANSFERS) {
    rules.push({
      rule: "R4",
      label: "Unusually rapid transfers",
      severity: "medium",
      impact: Math.min(RAPID_PENALTY_MAX, RAPID_PENALTY_EACH * (burst - RAPID_MAX_TRANSFERS)),
      details: `${burst} transfers within one hour.`,
    });
  }

  const score = Math.max(0, Math.min(100, 100 - rules.reduce((sum, r) => sum + r.impact, 0)));
  return { score, band: bandFor(score), rules };
}
