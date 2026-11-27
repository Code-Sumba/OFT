import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(2 * 60 * 60),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  /**
   * Proxy hops between the API and the X-Forwarded-For entry to trust, so req.ip (and
   * rate limiting) is the real visitor. Next.js forwards X-Forwarded-For unchanged (both
   * the /api rewrite and the server-rendered trace page), so for
   * visitor → reverse proxy (Coolify/Traefik/nginx, appends the visitor IP) → Next.js → API
   * the right value is 1. Keep the API off the public internet, or visitors could forge their IP.
   */
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(1),
  /** Public trace lookups per visitor IP per minute. */
  TRACE_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
  /** Failed logins per visitor IP per 15 minutes (successful logins are not counted). */
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  /** Registrations per visitor IP per hour. */
  REGISTER_RATE_LIMIT: z.coerce.number().int().positive().default(10),

  // Blockchain
  RPC_URL: z.string().url(),
  RELAYER_PRIVATE_KEY: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/, "must be a 32-byte hex private key"),
  CONTRACT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a contract address"),
  /** Block the contract was deployed in; the indexer starts here on first run. */
  DEPLOY_BLOCK: z.coerce.number().int().nonnegative().default(0),
  /** Amoy rejects tips below 25 gwei; 0 disables the floor (local Hardhat). */
  MIN_PRIORITY_FEE_GWEI: z.coerce.number().nonnegative().default(30),
  /** Cap on the tip; Amoy nodes often suggest ~56 gwei although the base fee is ~0. */
  MAX_PRIORITY_FEE_GWEI: z.coerce.number().positive().default(40),
  TX_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  EXPLORER_URL: z.string().url().default("https://amoy.polygonscan.com"),

  // Indexer
  INDEXER_POLL_MS: z.coerce.number().int().positive().default(5_000),
  INDEXER_CONFIRMATIONS: z.coerce.number().int().nonnegative().default(2),
  INDEXER_BLOCK_CHUNK: z.coerce.number().int().positive().default(1_000),

  // IPFS
  PINATA_JWT: z.string().optional(),
  IPFS_GATEWAY_URL: z.string().url().default("https://gateway.pinata.cloud/ipfs"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const config = parsed.data;
  if (config.NODE_ENV === "production") {
    // QR labels and CORS use this URL; a localhost value silently breaks both in production.
    if (/localhost|127\.0\.0\.1/.test(config.NEXT_PUBLIC_SITE_URL)) {
      throw new Error("Invalid environment configuration:\n  NEXT_PUBLIC_SITE_URL must be the public site URL in production");
    }
    if (!config.NEXT_PUBLIC_SITE_URL.startsWith("https://")) {
      console.warn("NEXT_PUBLIC_SITE_URL is not https: login cookies are Secure in production and need HTTPS.");
    }
  }
  return config;
}
