import "dotenv/config";
import { createApp } from "./app.js";
import { EthersChainClient } from "./chain/ethersClient.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { DisabledIpfsClient, PinataClient } from "./ipfs/pinata.js";

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const app = createApp({
  db: pool,
  config,
  chain: new EthersChainClient(config),
  ipfs: config.PINATA_JWT ? new PinataClient(config.PINATA_JWT) : new DisabledIpfsClient(),
});

if (!config.PINATA_JWT) console.warn("PINATA_JWT not set: file uploads are disabled.");

const server = app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});

function shutdown() {
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
