import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  ReactNode,
} from "react";
import { Account, AppState, Bucket, IncomeEntry, Txn } from "./types";
import { loadState, saveState, uid } from "./storage";

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
  | { type: "DELETE_TXN"; month: string; id: string };

function ensureMonth(state: AppState, month: string): AppState {
  if (state.months[month]) return state;
  return { ...state, months: { ...state.months, [month]: { income: [], txns: [] } } };
}

function reducer(state: AppState, action: Action): AppState {
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

    default:
      return state;
  }
}

interface StoreValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export { uid };
