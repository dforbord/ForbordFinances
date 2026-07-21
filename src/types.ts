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
  /** YYYY-MM-DD the entry was logged — powers the weekly charts. */
  date?: string;
  /** Fingerprint of an imported bank transaction, for de-duplication. */
  importKey?: string;
}

export interface Txn {
  id: string;
  bucketId: string;
  label: string;
  amount: number;
  /** For savings contributions: which account the money went into. */
  accountId?: string;
  /** YYYY-MM-DD the entry was logged — powers the weekly charts. */
  date?: string;
  /** Fingerprint of an imported bank transaction, for de-duplication. */
  importKey?: string;
}

/** Learned rule: a normalized description substring → which bucket to file it in. */
export interface CategoryRule {
  keyword: string;
  bucketId: string;
}

export interface MonthData {
  income: IncomeEntry[];
  txns: Txn[];
}

export interface GoalContribution {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  note?: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  /** YYYY-MM-DD */
  targetDate: string;
  /** YYYY-MM-DD — when the plan clock starts. */
  startDate: string;
  /** Amount already saved toward this goal at startDate. */
  startAmount: number;
  /** Amounts added manually toward this goal. */
  contributions: GoalContribution[];
  color: string;
}

export interface PlannedExpense {
  id: string;
  /** Start day (YYYY-MM-DD). */
  date: string;
  /** Optional end day for a multi-day block (YYYY-MM-DD). Single day if absent. */
  endDate?: string;
  label: string;
  amount: number;
  /** Category bucket this expense is filed into. */
  bucketId: string;
  /** Display color (inherited from the bucket). */
  color: string;
}

/** A record of one bank-statement file imported, so you can see what date ranges
 *  you've already pulled in and what your next upload still needs to cover. */
export interface UploadRecord {
  id: string;
  /** Name of the uploaded file. */
  fileName: string;
  /** Epoch ms when the file was imported. */
  importedAt: number;
  /** How many transactions were actually filed into buckets/income. */
  added: number;
  /** How many rows the file contained in total (added + duplicates + ignored). */
  total: number;
  /** Earliest transaction date in the file (YYYY-MM-DD). */
  coverageStart: string;
  /** Latest transaction date in the file (YYYY-MM-DD). */
  coverageEnd: string;
}

/** A logged stock-market investment (buy). The pie chart aggregates these by ticker. */
export interface Investment {
  id: string;
  /** Ticker symbol, stored uppercase (e.g. "VOO", "AAPL"). */
  ticker: string;
  /** Dollars invested. */
  amount: number;
  /** YYYY-MM-DD the investment was made. */
  date?: string;
  note?: string;
}

/** A logged business expense — tracked separately from the household budget. */
export interface BusinessExpense {
  id: string;
  name: string;
  amount: number;
  /** YYYY-MM the expense was charged. */
  month: string;
}

/** Where a wallet balance lives. Checking/savings/taxes are assets; credit is a debt. */
export type WalletAccountType = "checking" | "savings" | "taxes" | "credit";

/** One account or card in the Wallet — a manually-entered current balance snapshot,
 *  independent of the budget buckets. Credit balances are money owed (a liability). */
export interface WalletAccount {
  id: string;
  name: string;
  type: WalletAccountType;
  /** Whose account it is — free text, e.g. "Dylan", "Wife", "Joint". */
  owner: string;
  /** Current balance. For credit cards this is the amount owed. */
  balance: number;
  note?: string;
}

export interface AppState {
  version: number;
  buckets: Bucket[];
  accounts: Account[];
  months: Record<string, MonthData>;
  goals: Goal[];
  plannedExpenses: PlannedExpense[];
  /** Business expenses, kept apart from personal buckets/months. */
  businessExpenses: BusinessExpense[];
  /** Stock-market investments, aggregated by ticker on the Portfolio tab. */
  investments: Investment[];
  /** Current balances of every checking/savings/tax/credit account — the Wallet tab. */
  walletAccounts: WalletAccount[];
  /** History of bank-statement uploads, newest last — powers coverage tracking. */
  uploads: UploadRecord[];
  /** Learned import categorizations (description → bucket). */
  categoryRules: CategoryRule[];
  /** Epoch ms of the last edit. Used for last-write-wins when syncing devices. */
  lastModified: number;
}

export const CURRENT_VERSION = 1;
