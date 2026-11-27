/** Mirrors the contract enums; index = on-chain value. */
export const STAGES = ["farmer", "processor", "distributor", "retailer", "sold"] as const;
export type StageName = (typeof STAGES)[number];

export const CHAIN_STATUSES = ["registered", "certified", "rejected"] as const;
export type ChainStatus = (typeof CHAIN_STATUSES)[number];

interface EventBase {
  batchCode: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  timestamp: Date;
}

export type ChainEvent =
  | (EventBase & { type: "registered"; farmerId: string; product: string })
  | (EventBase & { type: "certified"; certifierId: string; approved: boolean; certCID: string; expiry: Date | null })
  | (EventBase & { type: "transferred"; fromActor: string; toActor: string; toStage: StageName; location: string })
  | (EventBase & { type: "sold"; location: string });

export interface ChainBatch {
  batchCode: string;
  product: string;
  origin: string;
  farmerId: string;
  certificateCID: string;
  certExpiry: Date | null;
  status: ChainStatus;
  stage: StageName;
  currentOwner: string;
}

export interface ChainTransfer {
  fromActor: string;
  toActor: string;
  toStage: StageName;
  location: string;
  timestamp: Date;
}

export interface TxResult {
  txHash: string;
  /** False when the transaction was sent but not confirmed within the timeout. */
  confirmed: boolean;
  blockNumber?: number;
  events: ChainEvent[];
}

/** Everything the backend needs from the chain; implemented with ethers in ethersClient.ts. */
export interface ChainClient {
  registerBatch(args: {
    batchCode: string;
    product: string;
    origin: string;
    harvestDate: Date;
    farmerId: string;
    certCID: string;
  }): Promise<TxResult>;
  certifyBatch(args: {
    batchCode: string;
    certCID: string;
    expiry: Date | null;
    approved: boolean;
    certifierId: string;
  }): Promise<TxResult>;
  transferBatch(args: { batchCode: string; toActor: string; toStage: StageName; location: string }): Promise<TxResult>;
  markSold(args: { batchCode: string; location: string }): Promise<TxResult>;

  getBatch(batchCode: string): Promise<ChainBatch | null>;
  getHistory(batchCode: string): Promise<ChainTransfer[]>;
  /** Contract events in [fromBlock, toBlock], in chain order. */
  getEvents(fromBlock: number, toBlock: number): Promise<ChainEvent[]>;
  getBlockNumber(): Promise<number>;
}
