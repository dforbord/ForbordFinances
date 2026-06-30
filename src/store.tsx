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
import { Account, AppState, Bucket, Goal, IncomeEntry, PlannedExpense, Txn } from "./types";
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
  | { type: "ADD_PLANNED"; planned: PlannedExpense }
  | { type: "UPDATE_PLANNED"; planned: PlannedExpense }
  | { type: "DELETE_PLANNED"; id: string };

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

export type FileStatus =
  | "unsupported"
  | "disconnected"
  | "needs-permission"
  | "connected"
  | "error";

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
    }),
    [state, supported, status, name, lastSavedAt, error, createFile, openFile, reconnect, disconnect],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export { uid };
