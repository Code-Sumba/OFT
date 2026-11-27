import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { newDb } from "pg-mem";
import request from "supertest";
import { inject } from "vitest";
import { createApp } from "../src/app.js";
import { EthersChainClient } from "../src/chain/ethersClient.js";
import type { Config } from "../src/config.js";
import type { Db } from "../src/db.js";
import type { IpfsClient } from "../src/ipfs/pinata.js";
import type { Role, UserStatus } from "../src/lib/roles.js";
import { createUser } from "../src/repositories/users.js";
import { TrustService } from "../src/services/trust.js";

const schema = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/schema.sql"),
  "utf8",
);

export function testConfig(): Config {
  const chain = inject("chain");
  return {
    NODE_ENV: "test",
    PORT: 0,
    DATABASE_URL: "pg-mem",
    JWT_SECRET: "test-secret-test-secret-test-secret-123",
    JWT_EXPIRES_IN_SECONDS: 3600,
    NEXT_PUBLIC_SITE_URL: "https://trace.example.org",
    TRUST_PROXY: 1,
    TRACE_RATE_LIMIT_PER_MIN: 1000,
    LOGIN_RATE_LIMIT: 1000,
    REGISTER_RATE_LIMIT: 1000,
    RPC_URL: chain.rpcUrl,
    RELAYER_PRIVATE_KEY: chain.relayerKey,
    CONTRACT_ADDRESS: chain.contractAddress,
    DEPLOY_BLOCK: 0,
    MIN_PRIORITY_FEE_GWEI: 0,
    MAX_PRIORITY_FEE_GWEI: 40,
    TX_TIMEOUT_MS: 15_000,
    EXPLORER_URL: "https://amoy.polygonscan.com",
    INDEXER_POLL_MS: 1000,
    INDEXER_CONFIRMATIONS: 0,
    INDEXER_BLOCK_CHUNK: 50,
    PINATA_JWT: undefined,
    IPFS_GATEWAY_URL: "https://gateway.example/ipfs",
  };
}

/** Records uploads and returns a deterministic fake CID. */
export class FakeIpfs implements IpfsClient {
  uploads: { filename: string; mimeType: string; size: number }[] = [];
  async upload(file: { buffer: Buffer; filename: string; mimeType: string }) {
    this.uploads.push({ filename: file.filename, mimeType: file.mimeType, size: file.buffer.length });
    return `bafkrei${String(this.uploads.length).padStart(52, "a")}`;
  }
}

/** Fresh in-memory Postgres with the real schema, the real local chain, and an app wired to both. */
export function setup(overrides: Partial<Config> = {}) {
  const mem = newDb();
  mem.public.none(schema);
  const { Pool } = mem.adapters.createPg();
  const db: Db = new Pool();
  const config = { ...testConfig(), ...overrides };
  const chain = new EthersChainClient(config);
  const ipfs = new FakeIpfs();
  const trust = new TrustService(db, chain);
  const app = createApp({ db, config, chain, ipfs, trust });
  return { db, app, api: request(app), chain, ipfs, trust, config, mem };
}

export const PASSWORD = "correct-horse-1";

export async function seedUser(db: Db, role: Role, status: UserStatus = "approved", email = `${role}-${status}@test.local`) {
  return createUser(db, {
    name: `${role} user`,
    email,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    role,
    status,
    organisation: `${role} org`,
  });
}

export async function loginToken(api: ReturnType<typeof request>, email: string): Promise<string> {
  const res = await api.post("/api/auth/login").send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.token as string;
}

/** One approved, logged-in user per role. */
export async function seedAllRoles(db: Db, api: ReturnType<typeof request>) {
  const roles = ["admin", "farmer", "certifier", "processor", "distributor", "retailer"] as const;
  const out = {} as Record<(typeof roles)[number], { user: Awaited<ReturnType<typeof seedUser>>; auth: { Authorization: string } }>;
  for (const role of roles) {
    const user = await seedUser(db, role);
    out[role] = { user, auth: { Authorization: `Bearer ${await loginToken(api, user.email)}` } };
  }
  return out;
}
