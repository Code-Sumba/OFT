import fs from "node:fs";
import path from "node:path";
import { ethers, network, run } from "hardhat";

// Amoy's base fee is ~0 but nodes suggest a high tip; clamp it so deploys stay cheap.
// Amoy requires at least 25 gwei. Local networks use Hardhat's defaults.
async function feeOverrides() {
  if (network.name === "hardhat" || network.name === "localhost") return {};
  const min = ethers.parseUnits(process.env.MIN_PRIORITY_FEE_GWEI || "30", "gwei");
  const max = ethers.parseUnits(process.env.MAX_PRIORITY_FEE_GWEI || "40", "gwei");
  const suggested = BigInt(await ethers.provider.send("eth_maxPriorityFeePerGas", []));
  const tip = suggested < min ? min : suggested > max ? max : suggested;
  const base = (await ethers.provider.getBlock("latest"))?.baseFeePerGas ?? 0n;
  return { maxPriorityFeePerGas: tip, maxFeePerGas: base * 2n + tip };
}

// Deploys OrganicTrace, grants CERTIFIER_ROLE if configured, writes the address
// and ABI to deployments/<network>.json and verifies on the explorer (non-local).
async function main() {
  const [deployer] = await ethers.getSigners();
  const relayer = process.env.RELAYER_ADDRESS || deployer.address;
  const certifier = process.env.CERTIFIER_ADDRESS;

  console.log(`Network:  ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Relayer:  ${relayer}`);

  const fees = await feeOverrides();
  const factory = await ethers.getContractFactory("OrganicTrace");
  const estimate = await ethers.provider.estimateGas(await factory.getDeployTransaction(deployer.address, relayer));
  const balance = await ethers.provider.getBalance(deployer.address);
  if (fees.maxFeePerGas) {
    const cost = estimate * fees.maxFeePerGas;
    console.log(`Balance:  ${ethers.formatEther(balance)} POL, deploy needs up to ${ethers.formatEther(cost)} POL (tip ${ethers.formatUnits(fees.maxPriorityFeePerGas!, "gwei")} gwei)`);
    if (balance < cost) throw new Error("Not enough POL for the deployment; get more from a faucet.");
  }

  const contract = await factory.deploy(deployer.address, relayer, fees);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  console.log(`OrganicTrace deployed at ${address} (tx ${deployTx?.hash})`);

  if (certifier) {
    const tx = await contract.grantRole(await contract.CERTIFIER_ROLE(), certifier, await feeOverrides());
    await tx.wait();
    console.log(`CERTIFIER_ROLE granted to ${certifier}`);
  }

  const artifact = await import("../artifacts/contracts/OrganicTrace.sol/OrganicTrace.json");
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const receipt = await deployTx?.wait();
  fs.writeFileSync(
    path.join(outDir, `${network.name}.json`),
    JSON.stringify(
      {
        network: network.name,
        chainId: Number(network.config.chainId ?? 31337),
        address,
        deployBlock: receipt?.blockNumber ?? 0,
        relayer,
        certifier: certifier ?? null,
        abi: artifact.abi,
      },
      null,
      2,
    ),
  );
  console.log(`Saved deployments/${network.name}.json`);

  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("Waiting for confirmations before verification...");
    await deployTx?.wait(5);
    try {
      await run("verify:verify", { address, constructorArguments: [deployer.address, relayer] });
    } catch (err) {
      console.warn(`Verification failed (can be retried with "npx hardhat verify"): ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
