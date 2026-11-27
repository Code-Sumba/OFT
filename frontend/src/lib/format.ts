import type { BatchStatus, Role, Stage, TrustBand } from "./types";

export const STAGE_LABEL: Record<Stage, string> = {
  farmer: "At farm",
  processor: "Processing",
  distributor: "In distribution",
  retailer: "At retailer",
  sold: "Sold",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  farmer: "Farmer",
  certifier: "Certifier",
  processor: "Processor",
  distributor: "Distributor",
  retailer: "Retailer",
};

export const STATUS_LABEL: Record<BatchStatus, string> = {
  registered: "Awaiting certification",
  certified: "Certified organic",
  rejected: "Rejected",
};

export const BAND_LABEL: Record<TrustBand, string> = {
  verified: "Verified",
  caution: "Caution",
  suspicious: "Suspicious",
};

export const bandFor = (score: number): TrustBand => (score >= 80 ? "verified" : score >= 50 ? "caution" : "suspicious");

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export const fmtDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : "—");
export const fmtDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : "—");
export const shortHash = (h: string | null | undefined) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "—");

/** "2026-12-31" one year from today, for date inputs. */
export function isoDateFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
