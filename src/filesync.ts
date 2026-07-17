// Option 2: auto-save to a real file via the File System Access API.
// Supported in Chrome/Edge (and other Chromium browsers). Not Safari/Firefox.
import { AppState, CURRENT_VERSION } from "./types";
import { idbGet, idbSet, idbDel } from "./idb";

const HANDLE_KEY = "budget-file-handle";

// The File System Access API isn't in TypeScript's standard lib yet, so we
// reach for it through `any` casts in a few spots below.
type FileHandle = FileSystemFileHandle;

export function isFileSyncSupported(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

export async function pickNewFile(): Promise<FileHandle> {
  const handle: FileHandle = await (window as any).showSaveFilePicker({
    suggestedName: "budget.json",
    types: [{ description: "Budget data", accept: { "application/json": [".json"] } }],
  });
  await idbSet(HANDLE_KEY, handle);
  return handle;
}

export async function pickExistingFile(): Promise<FileHandle> {
  const [handle]: FileHandle[] = await (window as any).showOpenFilePicker({
    types: [{ description: "Budget data", accept: { "application/json": [".json"] } }],
    multiple: false,
  });
  await idbSet(HANDLE_KEY, handle);
  return handle;
}

export async function getSavedHandle(): Promise<FileHandle | null> {
  return (await idbGet<FileHandle>(HANDLE_KEY)) ?? null;
}

export async function forgetHandle(): Promise<void> {
  await idbDel(HANDLE_KEY);
}

export async function verifyPermission(handle: FileHandle, request: boolean): Promise<boolean> {
  const opts = { mode: "readwrite" };
  if ((await (handle as any).queryPermission(opts)) === "granted") return true;
  if (!request) return false;
  return (await (handle as any).requestPermission(opts)) === "granted";
}

export async function readFile(handle: FileHandle): Promise<AppState | null> {
  const file = await handle.getFile();
  const text = await file.text();
  if (!text.trim()) return null;
  const parsed = JSON.parse(text) as AppState;
  return {
    version: parsed.version ?? CURRENT_VERSION,
    buckets: Array.isArray(parsed.buckets) ? parsed.buckets : [],
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    months: parsed.months ?? {},
    goals: Array.isArray(parsed.goals) ? parsed.goals : [],
    plannedExpenses: Array.isArray(parsed.plannedExpenses) ? parsed.plannedExpenses : [],
    businessExpenses: Array.isArray(parsed.businessExpenses) ? parsed.businessExpenses : [],
    investments: Array.isArray(parsed.investments) ? parsed.investments : [],
    uploads: Array.isArray(parsed.uploads) ? parsed.uploads : [],
    categoryRules: Array.isArray(parsed.categoryRules) ? parsed.categoryRules : [],
    lastModified: parsed.lastModified ?? 0,
  };
}

export async function writeFile(handle: FileHandle, state: AppState): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(
    new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
  );
  await writable.close();
}
