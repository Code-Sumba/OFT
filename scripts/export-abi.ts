import fs from "node:fs";
import path from "node:path";
import { artifacts } from "hardhat";

// Copies the compiled ABI into the backend so it always matches the contract.
async function main() {
  const artifact = await artifacts.readArtifact("OrganicTrace");
  const out = path.join(__dirname, "..", "backend", "src", "chain", "OrganicTrace.abi.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
