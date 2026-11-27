import {
  Contract,
  type ContractTransactionResponse,
  type InterfaceAbi,
  JsonRpcProvider,
  type Log,
  NonceManager,
  Wallet,
  isError,
  parseUnits,
} from "ethers";
import type { Config } from "../config.js";
import { ChainRevertError, ChainUnavailableError } from "./errors.js";
import abiJson from "./OrganicTrace.abi.json" with { type: "json" };
import {
  CHAIN_STATUSES,
  type ChainBatch,
  type ChainClient,
  type ChainEvent,
  type ChainTransfer,
  STAGES,
  type StageName,
  type TxResult,
} from "./types.js";

const abi = abiJson as InterfaceAbi;

const toSeconds = (d: Date) => BigInt(Math.floor(d.getTime() / 1000));
const fromSeconds = (s: bigint) => new Date(Number(s) * 1000);
const stageName = (v: bigint | number) => STAGES[Number(v)];

export class EthersChainClient implements ChainClient {
  private readonly provider: JsonRpcProvider;
  private readonly signer: NonceManager;
  private readonly contract: Contract;
  private readonly blockTimes = new Map<number, Date>();
  /** Serialises sends so nonces are assigned in order. */
  private sendQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: Pick<Config, "RPC_URL" | "RELAYER_PRIVATE_KEY" | "CONTRACT_ADDRESS" | "MIN_PRIORITY_FEE_GWEI" | "MAX_PRIORITY_FEE_GWEI" | "TX_TIMEOUT_MS">) {
    this.provider = new JsonRpcProvider(config.RPC_URL, undefined, { staticNetwork: true });
    this.signer = new NonceManager(new Wallet(config.RELAYER_PRIVATE_KEY, this.provider));
    this.contract = new Contract(config.CONTRACT_ADDRESS, abi, this.signer);
  }

  // ------------------------------------------------------------------ writes

  registerBatch(a: Parameters<ChainClient["registerBatch"]>[0]) {
    return this.send("registerBatch", [a.batchCode, a.product, a.origin, toSeconds(a.harvestDate), a.farmerId, a.certCID]);
  }

  certifyBatch(a: Parameters<ChainClient["certifyBatch"]>[0]) {
    return this.send("certifyBatch", [a.batchCode, a.certCID, a.expiry ? toSeconds(a.expiry) : 0n, a.approved, a.certifierId]);
  }

  transferBatch(a: Parameters<ChainClient["transferBatch"]>[0]) {
    return this.send("transferBatch", [a.batchCode, a.toActor, STAGES.indexOf(a.toStage), a.location]);
  }

  markSold(a: Parameters<ChainClient["markSold"]>[0]) {
    return this.send("markSold", [a.batchCode, a.location]);
  }

  private async send(method: string, args: unknown[]): Promise<TxResult> {
    const tx = await this.enqueue(async () => {
      try {
        // estimateGas runs first and surfaces custom-error reverts before anything is signed
        return (await this.contract.getFunction(method)(...args, await this.feeOverrides())) as ContractTransactionResponse;
      } catch (err) {
        this.signer.reset(); // a failed send may have consumed a local nonce
        throw this.translate(err);
      }
    });

    let receipt;
    try {
      receipt = await tx.wait(1, this.config.TX_TIMEOUT_MS);
    } catch (err) {
      if (isError(err, "TIMEOUT")) return { txHash: tx.hash, confirmed: false, events: [] };
      throw this.translate(err);
    }
    if (!receipt) return { txHash: tx.hash, confirmed: false, events: [] };

    return {
      txHash: tx.hash,
      confirmed: true,
      blockNumber: receipt.blockNumber,
      events: await this.parseLogs(receipt.logs),
    };
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.sendQueue.then(fn, fn);
    this.sendQueue = run.catch(() => undefined);
    return run;
  }

  private async feeOverrides() {
    if (this.config.MIN_PRIORITY_FEE_GWEI <= 0) return {};
    const fee = await this.provider.getFeeData();
    const floor = parseUnits(String(this.config.MIN_PRIORITY_FEE_GWEI), "gwei");
    const cap = parseUnits(String(this.config.MAX_PRIORITY_FEE_GWEI), "gwei");
    const suggested = fee.maxPriorityFeePerGas ?? floor;
    const tip = suggested < floor ? floor : suggested > cap ? cap : suggested;
    const block = await this.provider.getBlock("latest");
    const base = block?.baseFeePerGas ?? 0n;
    return { maxPriorityFeePerGas: tip, maxFeePerGas: base * 2n + tip };
  }

  private translate(err: unknown): Error {
    if (err instanceof ChainRevertError || err instanceof ChainUnavailableError) return err;
    if (isError(err, "CALL_EXCEPTION")) {
      // Reads decode custom errors into err.revert; failed sends only carry the raw revert data.
      const decoded = err.revert ?? (err.data ? this.contract.interface.parseError(err.data) : null);
      return new ChainRevertError(decoded?.name ?? "Reverted", decoded?.args ? [...decoded.args].map(String) : []);
    }
    return new ChainUnavailableError((err as Error).message);
  }

  // ------------------------------------------------------------------- reads

  async getBatch(batchCode: string): Promise<ChainBatch | null> {
    try {
      const b = await this.contract.getBatch(batchCode);
      return {
        batchCode: b.batchId,
        product: b.product,
        origin: b.origin,
        farmerId: b.farmerId,
        certificateCID: b.certificateCID,
        certExpiry: b.certExpiry > 0n ? fromSeconds(b.certExpiry) : null,
        status: CHAIN_STATUSES[Number(b.status)],
        stage: stageName(b.stage),
        currentOwner: b.currentOwner,
      };
    } catch (err) {
      const e = this.translate(err);
      if (e instanceof ChainRevertError && e.errorName === "BatchNotFound") return null;
      throw e;
    }
  }

  async getHistory(batchCode: string): Promise<ChainTransfer[]> {
    try {
      const rows = await this.contract.getHistory(batchCode);
      return rows.map((t: { fromActor: string; toActor: string; toStage: bigint; location: string; timestamp: bigint }) => ({
        fromActor: t.fromActor,
        toActor: t.toActor,
        toStage: stageName(t.toStage),
        location: t.location,
        timestamp: fromSeconds(t.timestamp),
      }));
    } catch (err) {
      const e = this.translate(err);
      if (e instanceof ChainRevertError && e.errorName === "BatchNotFound") return [];
      throw e;
    }
  }

  async getEvents(fromBlock: number, toBlock: number): Promise<ChainEvent[]> {
    try {
      const logs = await this.provider.getLogs({ address: this.config.CONTRACT_ADDRESS, fromBlock, toBlock });
      return await this.parseLogs(logs);
    } catch (err) {
      throw this.translate(err);
    }
  }

  async getBlockNumber(): Promise<number> {
    try {
      // Direct call: provider.getBlockNumber() may return a briefly cached value.
      return Number(await this.provider.send("eth_blockNumber", []));
    } catch (err) {
      throw this.translate(err);
    }
  }

  // ----------------------------------------------------------------- parsing

  private async parseLogs(logs: readonly Log[]): Promise<ChainEvent[]> {
    const events: ChainEvent[] = [];
    for (const log of logs) {
      if (log.address.toLowerCase() !== this.config.CONTRACT_ADDRESS.toLowerCase()) continue;
      const parsed = this.contract.interface.parseLog(log);
      if (!parsed) continue;
      const base = {
        batchCode: parsed.args.batchId as string,
        txHash: log.transactionHash,
        logIndex: log.index,
        blockNumber: log.blockNumber,
        timestamp: await this.blockTime(log.blockNumber),
      };
      const a = parsed.args;
      switch (parsed.name) {
        case "BatchRegistered":
          events.push({ ...base, type: "registered", farmerId: a.farmerId, product: a.product });
          break;
        case "BatchCertified":
          events.push({
            ...base,
            type: "certified",
            certifierId: a.certifierId,
            approved: a.approved,
            certCID: a.certCID,
            expiry: a.expiry > 0n ? fromSeconds(a.expiry) : null,
          });
          break;
        case "BatchTransferred":
          events.push({
            ...base,
            type: "transferred",
            fromActor: a.fromActor,
            toActor: a.toActor,
            toStage: stageName(a.toStage) as StageName,
            location: a.location,
          });
          break;
        case "BatchSold":
          events.push({ ...base, type: "sold", location: a.location });
          break;
        // RoleGranted etc. are not batch events
      }
    }
    return events;
  }

  private async blockTime(blockNumber: number): Promise<Date> {
    let t = this.blockTimes.get(blockNumber);
    if (!t) {
      const block = await this.provider.getBlock(blockNumber);
      t = new Date((block?.timestamp ?? Math.floor(Date.now() / 1000)) * 1000);
      if (this.blockTimes.size > 5000) this.blockTimes.clear();
      this.blockTimes.set(blockNumber, t);
    }
    return t;
  }
}
