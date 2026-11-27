import type { Db } from "../db.js";
import type { ChainStatus, StageName } from "../chain/types.js";
import type { PublicUser } from "./users.js";

export interface BatchRow {
  id: string;
  batch_code: string;
  product: string;
  quantity: string;
  unit: string;
  origin: string;
  harvest_date: Date | string;
  farmer_id: string;
  certificate_cid: string | null;
  cert_expiry: Date | null;
  status: ChainStatus;
  stage: StageName;
  current_owner_id: string;
  tx_hash_register: string | null;
  trust_score: number;
  last_block: string | number;
  last_log_index: number;
  created_at: Date;
}

export interface BatchEventRow {
  id: string | number;
  batch_code: string;
  event_type: "registered" | "certified" | "rejected" | "transferred" | "sold";
  from_user_id: string | null;
  to_user_id: string | null;
  stage: StageName | null;
  location: string | null;
  tx_hash: string;
  log_index: number;
  block_number: string | number;
  event_time: Date;
}

export interface CertificateRow {
  id: string | number;
  batch_code: string;
  cid: string | null;
  certifier_id: string;
  approved: boolean;
  expiry: Date | null;
  tx_hash: string;
  created_at: Date;
}

export async function insertBatch(
  db: Db,
  b: {
    id: string;
    batchCode: string;
    product: string;
    quantity: number;
    unit: string;
    origin: string;
    harvestDate: string;
    farmerId: string;
    certificateCid: string | null;
  },
): Promise<BatchRow> {
  const { rows } = await db.query<BatchRow>(
    `INSERT INTO batches (id, batch_code, product, quantity, unit, origin, harvest_date, farmer_id, certificate_cid, current_owner_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8)
     RETURNING *`,
    [b.id, b.batchCode, b.product, b.quantity, b.unit, b.origin, b.harvestDate, b.farmerId, b.certificateCid],
  );
  return rows[0];
}

export async function setRegisterTx(db: Db, batchCode: string, txHash: string) {
  await db.query("UPDATE batches SET tx_hash_register = $2 WHERE batch_code = $1", [batchCode, txHash]);
}

/** Removes a batch whose registration transaction failed. Only safe before any events exist. */
export async function deleteUnregisteredBatch(db: Db, batchCode: string) {
  await db.query(
    "DELETE FROM batches WHERE batch_code = $1 AND NOT EXISTS (SELECT 1 FROM batch_events WHERE batch_code = $1)",
    [batchCode],
  );
}

export async function findBatch(db: Db, batchCode: string): Promise<BatchRow | null> {
  const { rows } = await db.query<BatchRow>("SELECT * FROM batches WHERE batch_code = $1", [batchCode]);
  return rows[0] ?? null;
}

export interface BatchFilter {
  q?: string;
  status?: ChainStatus;
  stage?: StageName;
}

/**
 * Batches a user may see in their dashboard:
 * admin and certifier see all; farmers see their own; other roles see what they hold or have held.
 */
export async function listBatchesFor(db: Db, user: PublicUser, filter: BatchFilter): Promise<BatchRow[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    where.push(sql.replaceAll("?", `$${values.length}`));
  };

  if (user.role === "farmer") add("farmer_id = ?", user.id);
  else if (user.role !== "admin" && user.role !== "certifier") {
    add(
      "(current_owner_id = ? OR batch_code IN (SELECT batch_code FROM batch_events WHERE from_user_id = ? OR to_user_id = ?))",
      user.id,
    );
  }
  if (filter.status) add("status = ?", filter.status);
  if (filter.stage) add("stage = ?", filter.stage);
  if (filter.q) add("(LOWER(batch_code) LIKE ? OR LOWER(product) LIKE ?)", `%${filter.q.toLowerCase()}%`);

  const { rows } = await db.query<BatchRow>(
    `SELECT * FROM batches ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT 200`,
    values,
  );
  return rows;
}

export async function listEvents(db: Db, batchCode: string): Promise<BatchEventRow[]> {
  const { rows } = await db.query<BatchEventRow>(
    "SELECT * FROM batch_events WHERE batch_code = $1 ORDER BY block_number, log_index",
    [batchCode],
  );
  return rows;
}

export async function listCertificates(db: Db, batchCode: string): Promise<CertificateRow[]> {
  const { rows } = await db.query<CertificateRow>(
    "SELECT * FROM certificates WHERE batch_code = $1 ORDER BY created_at",
    [batchCode],
  );
  return rows;
}

export async function setTrustScore(db: Db, batchCode: string, score: number) {
  await db.query("UPDATE batches SET trust_score = $2 WHERE batch_code = $1", [batchCode, score]);
}
