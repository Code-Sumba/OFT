import { randomUUID } from "node:crypto";
import { id as keccakId } from "ethers";
import type { Db } from "../db.js";
import type { Role, UserStatus } from "../lib/roles.js";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
  organisation: string | null;
  chain_actor_id: string;
  created_at: Date;
}

export type PublicUser = Omit<UserRow, "password_hash">;

const PUBLIC_COLUMNS = "id, name, email, role, status, organisation, chain_actor_id, created_at";

export function toPublicUser({ password_hash: _omit, ...user }: UserRow): PublicUser {
  return user;
}

/** The bytes32 id recorded on-chain for a user: keccak256 of their UUID. */
export function chainActorId(userId: string): string {
  return keccakId(userId);
}

export async function createUser(
  db: Db,
  input: { name: string; email: string; passwordHash: string; role: Role; status?: UserStatus; organisation?: string | null },
): Promise<PublicUser> {
  const id = randomUUID();
  const { rows } = await db.query<PublicUser>(
    `INSERT INTO users (id, name, email, password_hash, role, status, organisation, chain_actor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      id,
      input.name,
      input.email.toLowerCase(),
      input.passwordHash,
      input.role,
      input.status ?? "pending",
      input.organisation ?? null,
      chainActorId(id),
    ],
  );
  return rows[0];
}

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  return rows[0] ?? null;
}

export async function findUserById(db: Db, id: string): Promise<PublicUser | null> {
  const { rows } = await db.query<PublicUser>(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listUsers(db: Db, filter: { status?: UserStatus; role?: Role }): Promise<PublicUser[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filter.status) {
    values.push(filter.status);
    where.push(`status = $${values.length}`);
  }
  if (filter.role) {
    values.push(filter.role);
    where.push(`role = $${values.length}`);
  }
  const { rows } = await db.query<PublicUser>(
    `SELECT ${PUBLIC_COLUMNS} FROM users ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`,
    values,
  );
  return rows;
}

export async function setUserStatus(db: Db, id: string, status: UserStatus): Promise<PublicUser | null> {
  const { rows } = await db.query<PublicUser>(
    `UPDATE users SET status = $2 WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [id, status],
  );
  return rows[0] ?? null;
}
