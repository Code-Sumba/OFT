import fs from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";

/**
 * Gas analysis (TRD section 14): runs the same lifecycle on
 *   Variant A - OrganicTraceNaive: every field, certificate text and readable history on-chain
 *   Variant B - OrganicTrace:      ids, short fields and an IPFS CID on-chain, files on IPFS
 * and writes backend/data/gas-report.json for the admin chart.
 *
 * Variant A stores the certificate's TEXT (about 1.5 KB). Storing the actual PDF
 * (typically 100 KB+) on-chain would cost far more and exceed block limits.
 */

const BATCHES = 5;
const GAS_PRICE_GWEI = 30; // Amoy tip used by the relayer; base fee is ~0

const CERTIFICATE_TEXT = [
  "NPOP ORGANIC PRODUCTION CERTIFICATE",
  "Certificate No: IN-ORG-2026-004512. Scope: Crop production (cereals, pulses).",
  "Operator: Patil Organic Farm, Survey No. 112/3, Village Ozar, Taluka Niphad, District Nashik, Maharashtra 422206.",
  "Certification body: Demo Certification Body (accredited under NPOP by APEDA), Accreditation No. NPOP/NAB/0099.",
  "This is to certify that the products listed below have been produced in accordance with the National Programme",
  "for Organic Production (NPOP), 8th edition, and are found to comply with its requirements for organic production.",
  "Products: Basmati rice (paddy), toor dal (pigeon pea), jowar (sorghum). Area under organic management: 4.2 ha.",
  "Status: Organic (fully converted). Conversion period completed on 15 March 2024. Inspection date: 02 September 2026.",
  "Soil sample and residue analysis reports (Lab ref LAB/NSK/2026/7781) attached to the inspection file; no prohibited",
  "substances detected above the limits prescribed by FSSAI (Organic Foods) Regulations, 2017.",
  "Validity: from 10 September 2026 to 09 September 2027, subject to annual surveillance inspection and unannounced",
  "visits. This certificate remains the property of the certification body and may be suspended or withdrawn if the",
  "operator fails to comply with NPOP standards. Authorised signatory: Chief Certification Officer.",
].join(" ");

const STEPS = [
  { name: "Fresh Pack Processing Pvt Ltd", role: "processor", location: "MIDC Ambad, Nashik, Maharashtra", notes: "Cleaned, sorted and packed in 25 kg jute bags; lot FP-2026-0912" },
  { name: "Swift Logistics Distribution", role: "distributor", location: "Bhiwandi Warehouse Zone, Thane, Maharashtra", notes: "Received in good condition; stored in dry warehouse bay 7" },
  { name: "Organic Mart Retail Store", role: "retailer", location: "FC Road, Shivajinagar, Pune, Maharashtra", notes: "Shelved in organic section; 25 kg bags repacked to 1 kg" },
];

type Row = { fn: string; naive: number; hybrid: number };

async function gasOf(txPromise: Promise<{ wait(): Promise<{ gasUsed: bigint } | null> }>): Promise<number> {
  const receipt = await (await txPromise).wait();
  return Number(receipt!.gasUsed);
}

async function main() {
  const [op] = await ethers.getSigners();
  const naiveFactory = await ethers.getContractFactory("OrganicTraceNaive");
  const hybridFactory = await ethers.getContractFactory("OrganicTrace");

  const naive = await naiveFactory.deploy();
  const hybrid = await hybridFactory.deploy(op.address, op.address);
  const naiveDeploy = Number((await naive.deploymentTransaction()!.wait())!.gasUsed);
  const hybridDeploy = Number((await hybrid.deploymentTransaction()!.wait())!.gasUsed);

  const totals: Record<string, { naive: number; hybrid: number }> = {
    registerBatch: { naive: 0, hybrid: 0 },
    certifyBatch: { naive: 0, hybrid: 0 },
    transferBatch: { naive: 0, hybrid: 0 },
    markSold: { naive: 0, hybrid: 0 },
  };
  const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
  const expiry = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

  for (let i = 0; i < BATCHES; i++) {
    const id = `OT-2026-GAS${String(i).padStart(3, "0")}`;
    const farmerId = ethers.id(`farmer-${i}`);

    totals.registerBatch.naive += await gasOf(
      naive.registerBatch({
        batchId: id,
        product: "Basmati Rice",
        quantity: "250 kg",
        origin: "Ozar, Niphad, Nashik, Maharashtra",
        harvestDate: "2026-09-15",
        farmerName: "Ramesh Patil",
        farmerOrganisation: "Patil Organic Farm",
        // Like-for-like: variant B stores the certificate's CID at registration, so A stores its text
        certificateText: CERTIFICATE_TEXT,
      }),
    );
    totals.registerBatch.hybrid += await gasOf(hybrid.registerBatch(id, "Basmati Rice", "Ozar, Niphad, Nashik, Maharashtra", 1789430400, farmerId, CID));

    totals.certifyBatch.naive += await gasOf(naive.certifyBatch(id, CERTIFICATE_TEXT, "Demo Certification Body - Chief Certification Officer", expiry, true));
    totals.certifyBatch.hybrid += await gasOf(hybrid.certifyBatch(id, CID, expiry, true, ethers.id("certifier")));

    for (const [s, step] of STEPS.entries()) {
      totals.transferBatch.naive += await gasOf(naive.transferBatch(id, step.name, step.role, step.location, step.notes));
      totals.transferBatch.hybrid += await gasOf(hybrid.transferBatch(id, ethers.id(`${step.role}-${i}`), s + 1, step.location));
    }

    totals.markSold.naive += await gasOf(naive.markSold(id, "FC Road, Shivajinagar, Pune, Maharashtra"));
    totals.markSold.hybrid += await gasOf(hybrid.markSold(id, "FC Road, Shivajinagar, Pune, Maharashtra"));
  }

  // Per-batch averages (transfer = average of one hop)
  const perCall: Row[] = [
    { fn: "registerBatch", naive: totals.registerBatch.naive / BATCHES, hybrid: totals.registerBatch.hybrid / BATCHES },
    { fn: "certifyBatch", naive: totals.certifyBatch.naive / BATCHES, hybrid: totals.certifyBatch.hybrid / BATCHES },
    { fn: "transferBatch", naive: totals.transferBatch.naive / (BATCHES * STEPS.length), hybrid: totals.transferBatch.hybrid / (BATCHES * STEPS.length) },
    { fn: "markSold", naive: totals.markSold.naive / BATCHES, hybrid: totals.markSold.hybrid / BATCHES },
  ].map((r) => ({ fn: r.fn, naive: Math.round(r.naive), hybrid: Math.round(r.hybrid) }));

  const lifecycle = (k: "naive" | "hybrid") =>
    perCall[0][k] + perCall[1][k] + perCall[2][k] * STEPS.length + perCall[3][k];
  const naiveLife = lifecycle("naive");
  const hybridLife = lifecycle("hybrid");
  const savingPct = Math.round((1 - hybridLife / naiveLife) * 1000) / 10;
  const pol = (gas: number) => (gas * GAS_PRICE_GWEI) / 1e9;

  const report = {
    generatedAt: new Date().toISOString(),
    batches: BATCHES,
    gasPriceGwei: GAS_PRICE_GWEI,
    note: "Variant A stores the certificate text (~1.5 KB) and readable history on-chain; Variant B stores ids, short fields and an IPFS CID.",
    deploy: { naive: naiveDeploy, hybrid: hybridDeploy },
    perCall,
    lifecycle: {
      naive: naiveLife,
      hybrid: hybridLife,
      savingPct,
      naivePol: pol(naiveLife),
      hybridPol: pol(hybridLife),
    },
  };

  const out = path.join(__dirname, "..", "backend", "data", "gas-report.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

  console.table(perCall.map((r) => ({ function: r.fn, "naive (A)": r.naive, "hybrid (B)": r.hybrid, saving: `${Math.round((1 - r.hybrid / r.naive) * 100)}%` })));
  console.log(`Full lifecycle per batch: naive ${naiveLife} gas vs hybrid ${hybridLife} gas -> ${savingPct}% less gas`);
  console.log(`At ${GAS_PRICE_GWEI} gwei: ${pol(naiveLife).toFixed(4)} POL vs ${pol(hybridLife).toFixed(4)} POL per batch`);
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
