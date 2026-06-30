export type BucketType = "expense" | "tax" | "savings";

export interface Bucket {
  id: string;
  name: string;
  type: BucketType;
  /** Monthly planned/budgeted amount. For savings buckets this is the target contribution. */
  planned: number;
  color: string;
}

export interface Account {
  id: string;
  name: string;
  startingBalance: number;
  note?: string;
}

export interface IncomeEntry {
  id: string;
  label: string;
  amount: number;
}

export interface Txn {
  id: string;
  bucketId: string;
  label: string;
  amount: number;
  /** For savings contributions: which account the money went into. */
  accountId?: string;
}

export interface MonthData {
  income: IncomeEntry[];
  txns: Txn[];
}

export interface AppState {
  version: number;
  buckets: Bucket[];
  accounts: Account[];
  months: Record<string, MonthData>;
  /** Epoch ms of the last edit. Used for last-write-wins when syncing devices. */
  lastModified: number;
}

export const CURRENT_VERSION = 1;
