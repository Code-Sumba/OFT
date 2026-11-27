import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";
import type { TestProject } from "vitest/node";

// Starts a real Hardhat node, deploys OrganicTrace and shares its address with the tests.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 8546;
export const RPC_URL = `http://127.0.0.1:${PORT}`;
// Hardhat's well-known account #0 (local test chain only, never use elsewhere).
export const LOCAL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

declare module "vitest" {
  export interface ProvidedContext {
    chain: { rpcUrl: string; contractAddress: string; relayerKey: string };
  }
}

let node: ChildProcess | undefined;

async function waitForRpc(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Hardhat node did not start on ${RPC_URL}`);
}

export default async function setup(project: TestProject) {
  const hardhatCli = path.join(ROOT, "node_modules", "hardhat", "internal", "cli", "bootstrap.js");
  if (!fs.existsSync(hardhatCli)) throw new Error("Run `npm install` in the repo root first (Hardhat is needed for tests)");

  const compile = spawnSync(process.execPath, [hardhatCli, "compile", "--quiet"], { cwd: ROOT, encoding: "utf8" });
  if (compile.status !== 0) throw new Error(`hardhat compile failed:\n${compile.stderr}`);

  node = spawn(process.execPath, [hardhatCli, "node", "--port", String(PORT)], { cwd: ROOT, stdio: "ignore" });
  await waitForRpc(30_000);

  const artifact = JSON.parse(
    fs.readFileSync(path.join(ROOT, "artifacts/contracts/OrganicTrace.sol/OrganicTrace.json"), "utf8"),
  );
  const wallet = new Wallet(LOCAL_KEY, new JsonRpcProvider(RPC_URL));
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, wallet).deploy(wallet.address, wallet.address);
  await contract.waitForDeployment();

  project.provide("chain", { rpcUrl: RPC_URL, contractAddress: await contract.getAddress(), relayerKey: LOCAL_KEY });

  return () => {
    node?.kill();
  };
}
