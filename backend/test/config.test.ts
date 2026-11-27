import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const base = {
  DATABASE_URL: "postgres://x",
  JWT_SECRET: "x".repeat(32),
  RPC_URL: "http://127.0.0.1:8545",
  RELAYER_PRIVATE_KEY: "0x" + "1".repeat(64),
  CONTRACT_ADDRESS: "0x" + "2".repeat(40),
};

describe("config", () => {
  it("applies safe defaults for proxy and rate limits", () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({ TRUST_PROXY: 1, TRACE_RATE_LIMIT_PER_MIN: 120, LOGIN_RATE_LIMIT: 20, REGISTER_RATE_LIMIT: 10 });
  });

  it("refuses a localhost site URL in production (it would be printed in QR codes)", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(() => loadConfig({ ...base, NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://trace.example.org" })).not.toThrow();
  });
});
