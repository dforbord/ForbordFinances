import { AppState, CURRENT_VERSION } from "./types";

const STORAGE_KEY = "budget.state.v1";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function defaultState(): AppState {
  const palette = [
    "#6366f1", "#ec4899", "#f59e0b", "#10b981",
    "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
  ];
  return {
    version: CURRENT_VERSION,
    buckets: [
      { id: uid(), name: "Housing", type: "expense", planned: 1800, color: palette[0] },
      { id: uid(), name: "Groceries", type: "expense", planned: 600, color: palette[3] },
      { id: uid(), name: "Transportation", type: "expense", planned: 250, color: palette[4] },
      { id: uid(), name: "Utilities", type: "expense", planned: 200, color: palette[2] },
      { id: uid(), name: "Federal Income Tax", type: "tax", planned: 900, color: palette[6] },
      { id: uid(), name: "State Tax", type: "tax", planned: 300, color: palette[1] },
      { id: uid(), name: "Emergency Fund", type: "savings", planned: 400, color: palette[7] },
      { id: uid(), name: "Retirement", type: "savings", planned: 500, color: palette[5] },
    ],
    accounts: [
      { id: uid(), name: "Emergency Savings", startingBalance: 0 },
      { id: uid(), name: "Brokerage / Retirement", startingBalance: 0 },
    ],
    months: {},
    goals: [],
    plannedExpenses: [],
    businessExpenses: [],
    categoryRules: [],
    lastModified: Date.now(),
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.buckets)) {
      return defaultState();
    }
    return {
      version: parsed.version ?? CURRENT_VERSION,
      buckets: parsed.buckets ?? [],
      accounts: parsed.accounts ?? [],
      months: parsed.months ?? {},
      goals: parsed.goals ?? [],
      plannedExpenses: parsed.plannedExpenses ?? [],
      businessExpenses: parsed.businessExpenses ?? [],
      categoryRules: parsed.categoryRules ?? [],
      lastModified: parsed.lastModified ?? 0,
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save state", e);
  }
}

export function exportState(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `budget-backup-${monthKey(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImported(text: string): AppState {
  const parsed = JSON.parse(text) as AppState;
  if (!parsed || !Array.isArray(parsed.buckets) || typeof parsed.months !== "object") {
    throw new Error("This file does not look like a budget backup.");
  }
  return {
    version: parsed.version ?? CURRENT_VERSION,
    buckets: parsed.buckets,
    accounts: parsed.accounts ?? [],
    months: parsed.months ?? {},
    goals: parsed.goals ?? [],
    plannedExpenses: parsed.plannedExpenses ?? [],
    businessExpenses: parsed.businessExpenses ?? [],
    categoryRules: parsed.categoryRules ?? [],
    lastModified: parsed.lastModified ?? 0,
  };
}
