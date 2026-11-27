import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

enum Stage {
  Farmer,
  Processor,
  Distributor,
  Retailer,
  Sold,
}

enum Status {
  Registered,
  Certified,
  Rejected,
}

const actor = (name: string) => ethers.id(name); // bytes32 stand-in for hash(user UUID)

const FARMER = actor("farmer-uuid");
const PROCESSOR = actor("processor-uuid");
const DISTRIBUTOR = actor("distributor-uuid");
const RETAILER = actor("retailer-uuid");
const CERTIFIER = actor("certifier-uuid");

const BATCH = "OT-2026-0001";
const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const ONE_YEAR = 365 * 24 * 60 * 60;

describe("OrganicTrace", () => {
  async function deployFixture() {
    const [admin, relayer, certifier, stranger] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("OrganicTrace");
    const contract = await factory.deploy(admin.address, relayer.address);
    await contract.grantRole(await contract.CERTIFIER_ROLE(), certifier.address);
    return { contract, admin, relayer, certifier, stranger };
  }

  async function registeredFixture() {
    const f = await deployFixture();
    await f.contract
      .connect(f.relayer)
      .registerBatch(BATCH, "Basmati Rice", "Dehradun, Uttarakhand", 1759968000, FARMER, CID);
    return f;
  }

  async function certifiedFixture() {
    const f = await registeredFixture();
    const expiry = (await time.latest()) + ONE_YEAR;
    await f.contract.connect(f.certifier).certifyBatch(BATCH, CID, expiry, true, CERTIFIER);
    return { ...f, expiry };
  }

  async function atRetailerFixture() {
    const f = await certifiedFixture();
    const c = f.contract.connect(f.relayer);
    await c.transferBatch(BATCH, PROCESSOR, Stage.Processor, "Haridwar");
    await c.transferBatch(BATCH, DISTRIBUTOR, Stage.Distributor, "Delhi");
    await c.transferBatch(BATCH, RETAILER, Stage.Retailer, "Mumbai");
    return f;
  }

  describe("deployment", () => {
    it("grants admin and relayer roles", async () => {
      const { contract, admin, relayer } = await loadFixture(deployFixture);
      expect(await contract.hasRole(await contract.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await contract.hasRole(await contract.RELAYER_ROLE(), relayer.address)).to.equal(true);
    });
  });

  describe("registerBatch", () => {
    it("stores the batch at Farmer stage with Registered status", async () => {
      const { contract } = await loadFixture(registeredFixture);
      const b = await contract.getBatch(BATCH);
      expect(b.product).to.equal("Basmati Rice");
      expect(b.farmerId).to.equal(FARMER);
      expect(b.currentOwner).to.equal(FARMER);
      expect(b.stage).to.equal(Stage.Farmer);
      expect(b.status).to.equal(Status.Registered);
      expect(b.certificateCID).to.equal(CID);
    });

    it("emits BatchRegistered", async () => {
      const { contract, relayer } = await loadFixture(deployFixture);
      await expect(contract.connect(relayer).registerBatch(BATCH, "Wheat", "Punjab", 0, FARMER, ""))
        .to.emit(contract, "BatchRegistered")
        .withArgs(BATCH, FARMER, "Wheat", (ts: bigint) => ts > 0n);
    });

    it("rejects a duplicate batch id", async () => {
      const { contract, relayer } = await loadFixture(registeredFixture);
      await expect(contract.connect(relayer).registerBatch(BATCH, "Wheat", "Punjab", 0, FARMER, ""))
        .to.be.revertedWithCustomError(contract, "BatchAlreadyExists")
        .withArgs(BATCH);
    });

    it("rejects callers without RELAYER_ROLE", async () => {
      const { contract, stranger } = await loadFixture(deployFixture);
      await expect(contract.connect(stranger).registerBatch(BATCH, "Wheat", "Punjab", 0, FARMER, ""))
        .to.be.revertedWithCustomError(contract, "Unauthorized")
        .withArgs(stranger.address);
    });

    it("rejects empty required fields, long strings and a zero farmer id", async () => {
      const { contract, relayer } = await loadFixture(deployFixture);
      const c = contract.connect(relayer);
      await expect(c.registerBatch("", "Wheat", "Punjab", 0, FARMER, ""))
        .to.be.revertedWithCustomError(contract, "EmptyField")
        .withArgs("batchId");
      await expect(c.registerBatch(BATCH, "x".repeat(129), "Punjab", 0, FARMER, ""))
        .to.be.revertedWithCustomError(contract, "StringTooLong")
        .withArgs("product");
      await expect(c.registerBatch(BATCH, "Wheat", "Punjab", 0, ethers.ZeroHash, "")).to.be.revertedWithCustomError(
        contract,
        "ZeroActor",
      );
    });
  });

  describe("certifyBatch", () => {
    it("lets a certifier approve with a future expiry", async () => {
      const { contract, expiry } = await loadFixture(certifiedFixture);
      const b = await contract.getBatch(BATCH);
      expect(b.status).to.equal(Status.Certified);
      expect(b.certExpiry).to.equal(expiry);
    });

    it("lets the relayer certify on behalf of a certifier", async () => {
      const { contract, relayer } = await loadFixture(registeredFixture);
      const expiry = (await time.latest()) + ONE_YEAR;
      await expect(contract.connect(relayer).certifyBatch(BATCH, CID, expiry, true, CERTIFIER))
        .to.emit(contract, "BatchCertified")
        .withArgs(BATCH, CERTIFIER, true, CID, expiry);
    });

    it("rejects an expiry that is not in the future", async () => {
      const { contract, certifier } = await loadFixture(registeredFixture);
      const past = (await time.latest()) - 1;
      await expect(contract.connect(certifier).certifyBatch(BATCH, CID, past, true, CERTIFIER))
        .to.be.revertedWithCustomError(contract, "ExpiryNotInFuture")
        .withArgs(past);
    });

    it("requires a certificate CID when approving", async () => {
      const { contract, certifier } = await loadFixture(registeredFixture);
      const expiry = (await time.latest()) + ONE_YEAR;
      await expect(contract.connect(certifier).certifyBatch(BATCH, "", expiry, true, CERTIFIER))
        .to.be.revertedWithCustomError(contract, "EmptyField")
        .withArgs("certCID");
    });

    it("records a rejection", async () => {
      const { contract, certifier } = await loadFixture(registeredFixture);
      await expect(contract.connect(certifier).certifyBatch(BATCH, "", 0, false, CERTIFIER))
        .to.emit(contract, "BatchCertified")
        .withArgs(BATCH, CERTIFIER, false, CID, 0);
      expect((await contract.getBatch(BATCH)).status).to.equal(Status.Rejected);
    });

    it("rejects strangers and unknown batches", async () => {
      const { contract, certifier, stranger } = await loadFixture(registeredFixture);
      const expiry = (await time.latest()) + ONE_YEAR;
      await expect(contract.connect(stranger).certifyBatch(BATCH, CID, expiry, true, CERTIFIER))
        .to.be.revertedWithCustomError(contract, "Unauthorized")
        .withArgs(stranger.address);
      await expect(contract.connect(certifier).certifyBatch("NOPE", CID, expiry, true, CERTIFIER))
        .to.be.revertedWithCustomError(contract, "BatchNotFound")
        .withArgs("NOPE");
    });

    it("cannot certify a sold batch", async () => {
      const { contract, relayer, certifier } = await loadFixture(atRetailerFixture);
      await contract.connect(relayer).markSold(BATCH, "Mumbai store");
      const expiry = (await time.latest()) + ONE_YEAR;
      await expect(contract.connect(certifier).certifyBatch(BATCH, CID, expiry, true, CERTIFIER))
        .to.be.revertedWithCustomError(contract, "BatchAlreadySold")
        .withArgs(BATCH);
    });
  });

  describe("transferBatch", () => {
    it("moves a certified batch forward one stage at a time and records history", async () => {
      const { contract } = await loadFixture(atRetailerFixture);
      const b = await contract.getBatch(BATCH);
      expect(b.stage).to.equal(Stage.Retailer);
      expect(b.currentOwner).to.equal(RETAILER);

      const history = await contract.getHistory(BATCH);
      expect(history.length).to.equal(3);
      expect(history.map((t) => [t.fromActor, t.toActor, t.toStage, t.location])).to.deep.equal([
        [FARMER, PROCESSOR, BigInt(Stage.Processor), "Haridwar"],
        [PROCESSOR, DISTRIBUTOR, BigInt(Stage.Distributor), "Delhi"],
        [DISTRIBUTOR, RETAILER, BigInt(Stage.Retailer), "Mumbai"],
      ]);
    });

    it("emits BatchTransferred", async () => {
      const { contract, relayer } = await loadFixture(certifiedFixture);
      await expect(contract.connect(relayer).transferBatch(BATCH, PROCESSOR, Stage.Processor, "Haridwar"))
        .to.emit(contract, "BatchTransferred")
        .withArgs(BATCH, FARMER, PROCESSOR, Stage.Processor, "Haridwar", (ts: bigint) => ts > 0n);
    });

    it("rejects skipping a stage (Farmer straight to Retailer)", async () => {
      const { contract, relayer } = await loadFixture(certifiedFixture);
      await expect(contract.connect(relayer).transferBatch(BATCH, RETAILER, Stage.Retailer, "Mumbai"))
        .to.be.revertedWithCustomError(contract, "InvalidStageTransition")
        .withArgs(Stage.Farmer, Stage.Retailer);
    });

    it("rejects moving backwards or staying in place", async () => {
      const { contract, relayer } = await loadFixture(certifiedFixture);
      const c = contract.connect(relayer);
      await c.transferBatch(BATCH, PROCESSOR, Stage.Processor, "Haridwar");
      await expect(c.transferBatch(BATCH, FARMER, Stage.Farmer, "Back")).to.be.revertedWithCustomError(
        contract,
        "InvalidStageTransition",
      );
      await expect(c.transferBatch(BATCH, PROCESSOR, Stage.Processor, "Same")).to.be.revertedWithCustomError(
        contract,
        "InvalidStageTransition",
      );
    });

    it("rejects transferring to Sold (must use markSold)", async () => {
      const { contract, relayer } = await loadFixture(atRetailerFixture);
      await expect(contract.connect(relayer).transferBatch(BATCH, RETAILER, Stage.Sold, "Mumbai"))
        .to.be.revertedWithCustomError(contract, "InvalidStageTransition")
        .withArgs(Stage.Retailer, Stage.Sold);
    });

    it("rejects uncertified and rejected batches", async () => {
      const { contract, relayer, certifier } = await loadFixture(registeredFixture);
      const c = contract.connect(relayer);
      await expect(c.transferBatch(BATCH, PROCESSOR, Stage.Processor, "Haridwar"))
        .to.be.revertedWithCustomError(contract, "BatchNotCertified")
        .withArgs(BATCH);

      await contract.connect(certifier).certifyBatch(BATCH, "", 0, false, CERTIFIER);
      await expect(c.transferBatch(BATCH, PROCESSOR, Stage.Processor, "Haridwar"))
        .to.be.revertedWithCustomError(contract, "BatchNotCertified")
        .withArgs(BATCH);
    });

    it("blocks transfers after a certifier revokes approval", async () => {
      const { contract, relayer, certifier } = await loadFixture(certifiedFixture);
      await contract.connect(relayer).transferBatch(BATCH, PROCESSOR, Stage.Processor, "Haridwar");
      await contract.connect(certifier).certifyBatch(BATCH, "", 0, false, CERTIFIER);
      await expect(
        contract.connect(relayer).transferBatch(BATCH, DISTRIBUTOR, Stage.Distributor, "Delhi"),
      ).to.be.revertedWithCustomError(contract, "BatchNotCertified");
    });

    it("rejects strangers, the certifier and a zero recipient", async () => {
      const { contract, relayer, certifier, stranger } = await loadFixture(certifiedFixture);
      await expect(contract.connect(stranger).transferBatch(BATCH, PROCESSOR, Stage.Processor, "Haridwar"))
        .to.be.revertedWithCustomError(contract, "Unauthorized")
        .withArgs(stranger.address);
      await expect(contract.connect(certifier).transferBatch(BATCH, PROCESSOR, Stage.Processor, "Haridwar"))
        .to.be.revertedWithCustomError(contract, "Unauthorized")
        .withArgs(certifier.address);
      await expect(
        contract.connect(relayer).transferBatch(BATCH, ethers.ZeroHash, Stage.Processor, "Haridwar"),
      ).to.be.revertedWithCustomError(contract, "ZeroActor");
    });
  });

  describe("markSold", () => {
    it("marks a Retailer-stage batch as Sold and appends to history", async () => {
      const { contract, relayer } = await loadFixture(atRetailerFixture);
      await expect(contract.connect(relayer).markSold(BATCH, "Mumbai store"))
        .to.emit(contract, "BatchSold")
        .withArgs(BATCH, "Mumbai store", (ts: bigint) => ts > 0n);

      expect((await contract.getBatch(BATCH)).stage).to.equal(Stage.Sold);
      const history = await contract.getHistory(BATCH);
      expect(history.length).to.equal(4);
      expect(history[3].fromActor).to.equal(RETAILER);
      expect(history[3].toActor).to.equal(ethers.ZeroHash);
      expect(history[3].toStage).to.equal(Stage.Sold);
    });

    it("only works at Retailer stage and only once", async () => {
      const { contract, relayer } = await loadFixture(certifiedFixture);
      await expect(contract.connect(relayer).markSold(BATCH, "Shop"))
        .to.be.revertedWithCustomError(contract, "NotAtRetailer")
        .withArgs(Stage.Farmer);

      const f = await loadFixture(atRetailerFixture);
      await f.contract.connect(f.relayer).markSold(BATCH, "Shop");
      await expect(f.contract.connect(f.relayer).markSold(BATCH, "Shop"))
        .to.be.revertedWithCustomError(f.contract, "NotAtRetailer")
        .withArgs(Stage.Sold);
    });
  });

  describe("views", () => {
    it("revert for unknown batches", async () => {
      const { contract } = await loadFixture(deployFixture);
      await expect(contract.getBatch("NOPE")).to.be.revertedWithCustomError(contract, "BatchNotFound");
      await expect(contract.getHistory("NOPE")).to.be.revertedWithCustomError(contract, "BatchNotFound");
      expect(await contract.batchExists("NOPE")).to.equal(false);
    });

    it("return an empty history for a fresh batch", async () => {
      const { contract } = await loadFixture(registeredFixture);
      expect(await contract.getHistory(BATCH)).to.deep.equal([]);
      expect(await contract.batchExists(BATCH)).to.equal(true);
    });
  });
});
