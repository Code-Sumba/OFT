import "dotenv/config";
import { EthersChainClient } from "./chain/ethersClient.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { runIndexerOnce } from "./services/indexer.js";
import { TrustService } from "./services/trust.js";

// Long-running worker: polls contract events into PostgreSQL. Run alongside the API.
const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const chain = new EthersChainClient(config);
const trust = new TrustService(pool, chain);

let stopping = false;
let timer: NodeJS.Timeout | undefined;

async function tick() {
  try {
    const applied = await runIndexerOnce(pool, chain, trust, {
      deployBlock: config.DEPLOY_BLOCK,
      confirmations: config.INDEXER_CONFIRMATIONS,
      blockChunk: config.INDEXER_BLOCK_CHUNK,
    });
    if (applied > 0) console.log(`Indexed ${applied} event(s)`);
  } catch (err) {
    console.error("Indexer tick failed (will retry):", (err as Error).message);
  }
  if (!stopping) timer = setTimeout(tick, config.INDEXER_POLL_MS);
}

function shutdown() {
  stopping = true;
  clearTimeout(timer);
  pool.end().then(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Indexer started for ${config.CONTRACT_ADDRESS} (poll every ${config.INDEXER_POLL_MS} ms)`);
void tick();
