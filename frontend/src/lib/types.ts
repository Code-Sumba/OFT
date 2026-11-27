// Shapes returned by the backend API (see backend/src/services/presenter.ts).

export type Role = "admin" | "farmer" | "certifier" | "processor" | "distributor" | "retailer";
export type Stage = "farmer" | "processor" | "distributor" | "retailer" | "sold";
export type BatchStatus = "registered" | "certified" | "rejected";
export type TrustBand = "verified" | "caution" | "suspicious";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "pending" | "approved" | "blocked";
  organisation: string | null;
  chain_actor_id: string;
  created_at: string;
}

export interface Party {
  id: string;
  name: string;
  organisation: string | null;
  role: Role;
}

export interface TxLink {
  hash: string | null;
  url: string | null;
}

export interface Batch {
  code: string;
  product: string;
  quantity: number;
  unit: string;
  origin: string;
  harvestDate: string;
  status: BatchStatus;
  stage: Stage;
  farmer: Party | null;
  currentOwner: Party | null;
  certificate: { cid: string | null; url: string | null; expiry: string | null; expired: boolean };
  trustScore: number;
  registerTx: TxLink;
  onChain: boolean;
  createdAt: string;
}

export interface BatchEvent {
  type: "registered" | "certified" | "rejected" | "transferred" | "sold";
  stage: Stage | null;
  location: string | null;
  time: string;
  from: Party | null;
  to: Party | null;
  tx: TxLink & { block: number };
}

export interface Certificate {
  approved: boolean;
  cid: string | null;
  url: string | null;
  expiry: string | null;
  certifier: Party | null;
  tx: TxLink;
  at: string;
}

export interface BatchDetail {
  batch: Batch;
  events: BatchEvent[];
  certificates: Certificate[];
  nextStage: Stage | null;
  canTransfer: boolean;
}

export interface TriggeredRule {
  rule: "R1" | "R2" | "R3" | "R4" | "R5";
  label: string;
  severity: "medium" | "high";
  impact: number;
  details: string;
}

export interface TraceData {
  batch: Batch;
  timeline: BatchEvent[];
  certificates: Certificate[];
  trust: { score: number; band: TrustBand; rules: TriggeredRule[] };
  verification: {
    badge: "verified" | "warning";
    chainChecked: boolean;
    matchesChain: boolean | null;
    differences: string[];
    contract: { address: string; url: string };
  };
}

export interface TxResponse {
  batch: Batch;
  tx: { hash: string; url: string; confirmed: boolean };
  message?: string;
}

export interface FraudAlert {
  id: number;
  batch_code: string;
  rule: TriggeredRule["rule"];
  severity: "medium" | "high";
  details: string | null;
  resolved: boolean;
  created_at: string;
  product: string;
  trust_score: number;
}

export interface Analytics {
  users: { byRole: Record<string, number>; byStatus: Record<string, number> };
  batches: { total: number; byStatus: Record<string, number>; byStage: Record<string, number>; averageTrustScore: number | null };
  openAlerts: Record<string, number>;
  daily: { date: string; registered: number; certified: number; transferred: number; sold: number }[];
}

export interface GasReport {
  generatedAt: string;
  batches: number;
  gasPriceGwei: number;
  note: string;
  deploy: { naive: number; hybrid: number };
  perCall: { fn: string; naive: number; hybrid: number }[];
  lifecycle: { naive: number; hybrid: number; savingPct: number; naivePol: number; hybridPol: number };
}
