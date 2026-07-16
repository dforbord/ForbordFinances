import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  ReactNode,
} from "react";
import {
  Account,
  AppState,
  Bucket,
  BusinessExpense,
  CategoryRule,
  Goal,
  GoalContribution,
  IncomeEntry,
  PlannedExpense,
  Txn,
  UploadRecord,
} from "./types";

export interface ImportItem {
  month: string;
  income?: IncomeEntry;
  txn?: Txn;
}
import { loadState, saveState, uid } from "./storage";
import {
  forgetHandle,
  getSavedHandle,
  isFileSyncSupported,
  pickExistingFile,
  pickNewFile,
  readFile,
  verifyPermission,
  writeFile,
} from "./filesync";
import {
  cloudConfigured,
  onAuth,
  signIn as cloudSignIn,
  signOutUser,
  subscribeBudget,
  writeBudget,
  User,
} from "./cloudsync";
import { ALLOWED_EMAILS } from "./firebase-config";

type Action =
  | { type: "REPLACE"; state: AppState }
  | { type: "ADD_BUCKET"; bucket: Bucket }
  | { type: "UPDATE_BUCKET"; bucket: Bucket }
  | { type: "DELETE_BUCKET"; id: string }
  | { type: "ADD_ACCOUNT"; account: Account }
  | { type: "UPDATE_ACCOUNT"; account: Account }
  | { type: "DELETE_ACCOUNT"; id: string }
  | { type: "ADD_INCOME"; month: string; entry: IncomeEntry }
  | { type: "UPDATE_INCOME"; month: string; entry: IncomeEntry }
  | { type: "DELETE_INCOME"; month: string; id: string }
  | { type: "ADD_TXN"; month: string; txn: Txn }
  | { type: "UPDATE_TXN"; month: string; txn: Txn }
  | { type: "DELETE_TXN"; month: string; id: string }
  | { type: "ADD_GOAL"; goal: Goal }
  | { type: "UPDATE_GOAL"; goal: Goal }
  | { type: "DELETE_GOAL"; id: string }
  | { type: "ADD_GOAL_CONTRIB"; goalId: string; contribution: GoalContribution }
  | { type: "DELETE_GOAL_CONTRIB"; goalId: string; contribId: string }
  | { type: "ADD_PLANNED"; planned: PlannedExpense }
  | { type: "UPDATE_PLANNED"; planned: PlannedExpense }
  | { type: "DELETE_PLANNED"; id: string }
  | { type: "ADD_BUSINESS_EXPENSE"; expense: BusinessExpense }
  | { type: "UPDATE_BUSINESS_EXPENSE"; expense: BusinessExpense }
  | { type: "DELETE_BUSINESS_EXPENSE"; id: string }
  | { type: "IMPORT_BATCH"; items: ImportItem[]; rules: CategoryRule[]; upload?: UploadRecord };

function ensureMonth(state: AppState, month: string): AppState {
  if (state.months[month]) return state;
  return { ...state, months: { ...state.months, [month]: { income: [], txns: [] } } };
}

function baseReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "REPLACE":
      return action.state;

    case "ADD_BUCKET":
      return { ...state, buckets: [...state.buckets, action.bucket] };
    case "UPDATE_BUCKET":
      return {
        ...state,
        buckets: state.buckets.map((b) => (b.id === action.bucket.id ? action.bucket : b)),
      };
    case "DELETE_BUCKET": {
      const months: AppState["months"] = {};
      for (const [k, m] of Object.entries(state.months)) {
        months[k] = { ...m, txns: m.txns.filter((t) => t.bucketId !== action.id) };
      }
      return { ...state, buckets: state.buckets.filter((b) => b.id !== action.id), months };
    }

    case "ADD_ACCOUNT":
      return { ...state, accounts: [...state.accounts, action.account] };
    case "UPDATE_ACCOUNT":
      return {
        ...state,
        accounts: state.accounts.map((a) => (a.id === action.account.id ? action.account : a)),
      };
    case "DELETE_ACCOUNT":
      return { ...state, accounts: state.accounts.filter((a) => a.id !== action.id) };

    case "ADD_INCOME": {
      const s = ensureMonth(state, action.month);
      const m = s.months[action.month];
      return {
        ...s,
        months: { ...s.months, [action.month]: { ...m, income: [...m.income, action.entry] } },
      };
    }
    case "UPDATE_INCOME": {
      const m = state.months[action.month];
      if (!m) return state;
      return {
        ...state,
        months: {
          ...state.months,
          [action.month]: {
            ...m,
            income: m.income.map((i) => (i.id === action.entry.id ? action.entry : i)),
          },
        },
      };
    }
    case "DELETE_INCOME": {
      const m = state.months[action.month];
      if (!m) return state;
      return {
        ...state,
        months: {
          ...state.months,
          [action.month]: { ...m, income: m.income.filter((i) => i.id !== action.id) },
        },
      };
    }

    case "ADD_TXN": {
      const s = ensureMonth(state, action.month);
      const m = s.months[action.month];
      return {
        ...s,
        months: { ...s.months, [action.month]: { ...m, txns: [...m.txns, action.txn] } },
      };
    }
    case "UPDATE_TXN": {
      const m = state.months[action.month];
      if (!m) return state;
      return {
        ...state,
        months: {
          ...state.months,
          [action.month]: {
            ...m,
            txns: m.txns.map((t) => (t.id === action.txn.id ? action.txn : t)),
          },
        },
      };
    }
    case "DELETE_TXN": {
      const m = state.months[action.month];
      if (!m) return state;
      return {
        ...state,
        months: {
          ...state.months,
          [action.month]: { ...m, txns: m.txns.filter((t) => t.id !== action.id) },
        },
      };
    }

    case "ADD_GOAL":
      return { ...state, goals: [...state.goals, action.goal] };
    case "UPDATE_GOAL":
      return {
        ...state,
        goals: state.goals.map((g) => (g.id === action.goal.id ? action.goal : g)),
      };
    case "DELETE_GOAL":
      return { ...state, goals: state.goals.filter((g) => g.id !== action.id) };
    case "ADD_GOAL_CONTRIB":
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === action.goalId
            ? { ...g, contributions: [...g.contributions, action.contribution] }
            : g,
        ),
      };
    case "DELETE_GOAL_CONTRIB":
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === action.goalId
            ? { ...g, contributions: g.contributions.filter((c) => c.id !== action.contribId) }
            : g,
        ),
      };

    case "ADD_PLANNED":
      return { ...state, plannedExpenses: [...state.plannedExpenses, action.planned] };
    case "UPDATE_PLANNED":
      return {
        ...state,
        plannedExpenses: state.plannedExpenses.map((p) =>
          p.id === action.planned.id ? action.planned : p,
        ),
      };
    case "DELETE_PLANNED":
      return {
        ...state,
        plannedExpenses: state.plannedExpenses.filter((p) => p.id !== action.id),
      };

    case "ADD_BUSINESS_EXPENSE":
      return { ...state, businessExpenses: [...state.businessExpenses, action.expense] };
    case "UPDATE_BUSINESS_EXPENSE":
      return {
        ...state,
        businessExpenses: state.businessExpenses.map((e) =>
          e.id === action.expense.id ? action.expense : e,
        ),
      };
    case "DELETE_BUSINESS_EXPENSE":
      return {
        ...state,
        businessExpenses: state.businessExpenses.filter((e) => e.id !== action.id),
      };

    case "IMPORT_BATCH": {
      const months = { ...state.months };
      for (const it of action.items) {
        const m = months[it.month] ?? { income: [], txns: [] };
        months[it.month] = {
          income: it.income ? [...m.income, it.income] : m.income,
          txns: it.txn ? [...m.txns, it.txn] : m.txns,
        };
      }
      const ruleMap = new Map(state.categoryRules.map((r) => [r.keyword, r]));
      for (const r of action.rules) ruleMap.set(r.keyword, r);
      return {
        ...state,
        months,
        categoryRules: [...ruleMap.values()],
        uploads: action.upload ? [...state.uploads, action.upload] : state.uploads,
      };
    }

    default:
      return state;
  }
}

// Stamp lastModified on every real edit so device/file reconciliation can use
// last-write-wins. REPLACE carries its own lastModified (from a file or import).
function reducer(state: AppState, action: Action): AppState {
  const next = baseReducer(state, action);
  if (next === state) return state;
  if (action.type === "REPLACE") return next;
  return { ...next, lastModified: Date.now() };
}

/** Fill in any missing fields on state arriving from the cloud. */
function coerce(raw: AppState): AppState {
  return {
    version: raw.version ?? 1,
    buckets: Array.isArray(raw.buckets) ? raw.buckets : [],
    accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
    months: raw.months ?? {},
    goals: Array.isArray(raw.goals) ? raw.goals : [],
    plannedExpenses: Array.isArray(raw.plannedExpenses) ? raw.plannedExpenses : [],
    businessExpenses: Array.isArray(raw.businessExpenses) ? raw.businessExpenses : [],
    uploads: Array.isArray(raw.uploads) ? raw.uploads : [],
    categoryRules: Array.isArray(raw.categoryRules) ? raw.categoryRules : [],
    lastModified: raw.lastModified ?? 0,
  };
}

export type FileStatus =
  | "unsupported"
  | "disconnected"
  | "needs-permission"
  | "connected"
  | "error";

export type CloudStatus = "connecting" | "synced" | "offline";

interface CloudSync {
  configured: boolean;
  authReady: boolean;
  user: { email: string | null; name: string | null } | null;
  status: CloudStatus;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

interface FileSync {
  supported: boolean;
  status: FileStatus;
  name: string | null;
  lastSavedAt: number | null;
  error: string | null;
  createFile: () => Promise<void>;
  openFile: () => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

interface StoreValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  file: FileSync;
  cloud: CloudSync;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  const supported = isFileSyncSupported();
  const [status, setStatus] = useState<FileStatus>(supported ? "disconnected" : "unsupported");
  const [name, setName] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRef = useRef<FileSystemFileHandle | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  // The lastModified value currently persisted to the file, so the save effect
  // doesn't echo a write right after we load from the file.
  const fileAppliedModified = useRef<number>(-1);

  // Decide, on connect, whether the file or local data is newer and sync once.
  const reconcile = useCallback(async (handle: FileSystemFileHandle, fileState: AppState | null) => {
    const local = stateRef.current;
    if (fileState && fileState.lastModified > local.lastModified) {
      fileAppliedModified.current = fileState.lastModified;
      dispatch({ type: "REPLACE", state: fileState });
    } else {
      await writeFile(handle, local);
      fileAppliedModified.current = local.lastModified;
      setLastSavedAt(Date.now());
    }
  }, []);

  // On launch, try to silently reconnect to the previously chosen file.
  useEffect(() => {
    if (!supported) return;
    (async () => {
      try {
        const handle = await getSavedHandle();
        if (!handle) return;
        handleRef.current = handle;
        setName(handle.name);
        if (await verifyPermission(handle, false)) {
          await reconcile(handle, await readFile(handle));
          setStatus("connected");
        } else {
          setStatus("needs-permission");
        }
      } catch {
        setStatus("disconnected");
      }
    })();
  }, [supported, reconcile]);

  // Always cache to localStorage; also push to the file when connected.
  useEffect(() => {
    saveState(state);
    if (status !== "connected" || !handleRef.current) return;
    if (state.lastModified === fileAppliedModified.current) return;
    const handle = handleRef.current;
    const t = setTimeout(async () => {
      try {
        await writeFile(handle, state);
        fileAppliedModified.current = state.lastModified;
        setLastSavedAt(Date.now());
      } catch {
        setStatus("error");
        setError("Could not write to the data file. Reconnect it from the Backup tab.");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [state, status]);

  const createFile = useCallback(async () => {
    try {
      setError(null);
      const handle = await pickNewFile();
      handleRef.current = handle;
      setName(handle.name);
      await writeFile(handle, stateRef.current);
      fileAppliedModified.current = stateRef.current.lastModified;
      setLastSavedAt(Date.now());
      setStatus("connected");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setStatus("error");
      setError((e as Error).message);
    }
  }, []);

  const openFile = useCallback(async () => {
    try {
      setError(null);
      const handle = await pickExistingFile();
      handleRef.current = handle;
      setName(handle.name);
      await reconcile(handle, await readFile(handle));
      setStatus("connected");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setStatus("error");
      setError((e as Error).message);
    }
  }, [reconcile]);

  const reconnect = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) return;
    try {
      setError(null);
      if (await verifyPermission(handle, true)) {
        await reconcile(handle, await readFile(handle));
        setStatus("connected");
      } else {
        setStatus("needs-permission");
      }
    } catch (e) {
      setStatus("error");
      setError((e as Error).message);
    }
  }, [reconcile]);

  const disconnect = useCallback(async () => {
    await forgetHandle();
    handleRef.current = null;
    setName(null);
    setLastSavedAt(null);
    setError(null);
    setStatus(supported ? "disconnected" : "unsupported");
  }, [supported]);

  // ── Live cloud sync (Firebase) ──────────────────────────────────────────
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!cloudConfigured);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("connecting");
  const [cloudError, setCloudError] = useState<string | null>(null);
  // lastModified currently reflected from the cloud — avoids echoing it back.
  const cloudAppliedModified = useRef<number>(-1);

  useEffect(() => {
    if (!cloudConfigured) return;
    return onAuth((u) => {
      if (u && ALLOWED_EMAILS.length > 0 && (!u.email || !ALLOWED_EMAILS.includes(u.email))) {
        setCloudError(`${u.email ?? "That account"} isn't on the allowed list.`);
        signOutUser();
        setUser(null);
        setAuthReady(true);
        return;
      }
      setCloudError(null);
      setUser(u);
      setAuthReady(true);
    });
  }, []);

  // Subscribe to the shared doc; apply remote changes that are newer than ours.
  useEffect(() => {
    if (!cloudConfigured || !user) return;
    setCloudStatus("connecting");
    return subscribeBudget(
      (remote) => {
        if (remote == null) {
          // No cloud copy yet → seed it from whatever this device has.
          cloudAppliedModified.current = stateRef.current.lastModified;
          writeBudget(stateRef.current).catch(() => {});
          setCloudStatus("synced");
          return;
        }
        const incoming = coerce(remote);
        if (incoming.lastModified > stateRef.current.lastModified) {
          cloudAppliedModified.current = incoming.lastModified;
          dispatch({ type: "REPLACE", state: incoming });
        }
        setCloudStatus("synced");
      },
      () => setCloudStatus("offline"),
    );
  }, [user]);

  // Push local edits up (debounced), skipping anything that came from the cloud.
  useEffect(() => {
    if (!cloudConfigured || !user) return;
    if (state.lastModified === cloudAppliedModified.current) return;
    const t = setTimeout(() => {
      writeBudget(state)
        .then(() => setCloudStatus("synced"))
        .catch(() => setCloudStatus("offline"));
    }, 600);
    return () => clearTimeout(t);
  }, [state, user]);

  const doSignIn = useCallback(async () => {
    try {
      setCloudError(null);
      await cloudSignIn();
    } catch (e) {
      const name = (e as { code?: string }).code ?? "";
      if (!name.includes("popup-closed") && !name.includes("cancelled")) {
        setCloudError((e as Error).message);
      }
    }
  }, []);

  const doSignOut = useCallback(async () => {
    await signOutUser();
    setUser(null);
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      dispatch,
      file: {
        supported,
        status,
        name,
        lastSavedAt,
        error,
        createFile,
        openFile,
        reconnect,
        disconnect,
      },
      cloud: {
        configured: cloudConfigured,
        authReady,
        user: user ? { email: user.email, name: user.displayName } : null,
        status: cloudStatus,
        error: cloudError,
        signIn: doSignIn,
        signOut: doSignOut,
      },
    }),
    [
      state, supported, status, name, lastSavedAt, error, createFile, openFile, reconnect, disconnect,
      authReady, user, cloudStatus, cloudError, doSignIn, doSignOut,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export { uid };
