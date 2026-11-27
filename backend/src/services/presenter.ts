import type { Config } from "../config.js";
import { type Db, placeholders } from "../db.js";
import { gatewayUrl } from "../ipfs/pinata.js";
import type { BatchEventRow, BatchRow, CertificateRow } from "../repositories/batches.js";

export interface Party {
  id: string;
  name: string;
  organisation: string | null;
  role: string;
}

export const txUrl = (config: Pick<Config, "EXPLORER_URL">, hash: string | null | undefined) =>
  hash ? `${config.EXPLORER_URL.replace(/\/$/, "")}/tx/${hash}` : null;

export const addressUrl = (config: Pick<Config, "EXPLORER_URL">, address: string) =>
  `${config.EXPLORER_URL.replace(/\/$/, "")}/address/${address}`;

/** Loads public profiles (no emails) for the given user ids. */
export async function loadParties(db: Db, ids: (string | null | undefined)[]): Promise<Map<string, Party>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const { rows } = await db.query<Party>(
    `SELECT id, name, organisation, role FROM users WHERE id IN (${placeholders(unique.length)})`,
    unique,
  );
  return new Map(rows.map((r) => [r.id, r]));
}

const dateOnly = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

export function presentBatch(config: Config, b: BatchRow, parties: Map<string, Party>) {
  const expiry = b.cert_expiry ? new Date(b.cert_expiry) : null;
  return {
    code: b.batch_code,
    product: b.product,
    quantity: Number(b.quantity),
    unit: b.unit,
    origin: b.origin,
    harvestDate: dateOnly(b.harvest_date),
    status: b.status,
    stage: b.stage,
    farmer: parties.get(b.farmer_id) ?? null,
    currentOwner: parties.get(b.current_owner_id) ?? null,
    certificate: {
      cid: b.certificate_cid,
      url: gatewayUrl(config.IPFS_GATEWAY_URL, b.certificate_cid),
      expiry: expiry?.toISOString() ?? null,
      expired: expiry ? expiry.getTime() < Date.now() : false,
    },
    trustScore: b.trust_score,
    registerTx: { hash: b.tx_hash_register, url: txUrl(config, b.tx_hash_register) },
    onChain: b.tx_hash_register !== null && Number(b.last_block) > 0,
    createdAt: new Date(b.created_at).toISOString(),
  };
}

export function presentEvent(config: Config, e: BatchEventRow, parties: Map<string, Party>) {
  return {
    type: e.event_type,
    stage: e.stage,
    location: e.location,
    time: new Date(e.event_time).toISOString(),
    from: e.from_user_id ? parties.get(e.from_user_id) ?? null : null,
    to: e.to_user_id ? parties.get(e.to_user_id) ?? null : null,
    tx: { hash: e.tx_hash, url: txUrl(config, e.tx_hash), block: Number(e.block_number) },
  };
}

export function presentCertificate(config: Config, c: CertificateRow, parties: Map<string, Party>) {
  return {
    approved: c.approved,
    cid: c.cid,
    url: gatewayUrl(config.IPFS_GATEWAY_URL, c.cid),
    expiry: c.expiry ? new Date(c.expiry).toISOString() : null,
    certifier: parties.get(c.certifier_id) ?? null,
    tx: { hash: c.tx_hash, url: txUrl(config, c.tx_hash) },
    at: new Date(c.created_at).toISOString(),
  };
}
