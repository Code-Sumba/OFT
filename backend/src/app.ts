import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { ChainClient } from "./chain/types.js";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import type { IpfsClient } from "./ipfs/pinata.js";
import { ok } from "./lib/http.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { batchesRouter } from "./routes/batches.js";
import { traceRouter } from "./routes/trace.js";
import { uploadRouter } from "./routes/upload.js";
import { usersRouter } from "./routes/users.js";
import { TrustService } from "./services/trust.js";

export interface AppDeps {
  db: Db;
  config: Config;
  chain: ChainClient;
  ipfs: IpfsClient;
  trust: TrustService;
}

export function createApp(input: Omit<AppDeps, "trust"> & { trust?: TrustService }) {
  const deps: AppDeps = { ...input, trust: input.trust ?? new TrustService(input.db, input.chain) };
  const { db, config } = deps;
  const app = express();

  app.set("trust proxy", config.TRUST_PROXY); // see TRUST_PROXY in config.ts
  app.use(helmet());
  app.use(cors({ origin: config.NEXT_PUBLIC_SITE_URL, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    ok(res, { status: "ok" });
  });
  app.use("/api/auth", authRouter(db, config));
  app.use("/api/admin", adminRouter(deps));
  app.use("/api/users", usersRouter(deps));
  app.use("/api/upload", uploadRouter(deps));
  app.use("/api/batches", batchesRouter(deps));
  app.use("/api/trace", traceRouter(deps));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
