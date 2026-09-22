import { initializeApp, FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  Auth,
  User,
} from "firebase/auth";
import {
  initializeFirestore,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  Firestore,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";
import { AppState } from "./types";

/** True once a real Firebase project is pasted into firebase-config.ts. */
export const cloudConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (cloudConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // ignoreUndefinedProperties so optional fields (accountId, endDate, …) don't
  // make setDoc throw.
  db = initializeFirestore(app, { ignoreUndefinedProperties: true });
}

// ─────────────────────────────────────────────────────────────────────────
//  Multi-tenant layout
//
//    households/{hid}   metadata ONLY — { name, memberEmails, ownerEmail }
//    budgets/{hid}      the AppState blob for that household
//
//  These are deliberately SEPARATE documents. The app saves the budget with a
//  whole-document setDoc(), so if membership lived in the same doc every
//  ordinary budget save would wipe the member list.
// ─────────────────────────────────────────────────────────────────────────
const HOUSEHOLDS = "households";
const BUDGETS = "budgets";

/** The pre-multi-tenant budget doc, migrated into a household on first create. */
const LEGACY_BUDGET_ID = "household";

export interface Household {
  id: string;
  name: string;
  /** Lowercased emails. Membership is the access control — see firestore.rules. */
  memberEmails: string[];
  ownerEmail: string;
  createdAt: number;
}

/** Emails are stored and compared lowercased so casing can never split a member. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toHousehold(id: string, data: Record<string, unknown>): Household {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "Household",
    memberEmails: Array.isArray(data.memberEmails) ? (data.memberEmails as string[]) : [],
    ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : "",
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
  };
}

export function onAuth(cb: (user: User | null) => void): () => void {
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}

export async function signIn(): Promise<void> {
  if (!auth) return;
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

// ── Households ───────────────────────────────────────────────────────────

/**
 * Live view of the one household this email belongs to (or null). A user
 * belongs to exactly one household, so this takes the first match.
 */
export function subscribeMyHousehold(
  email: string,
  onData: (household: Household | null) => void,
  onError: (e: Error) => void,
): () => void {
  if (!db) {
    onData(null);
    return () => {};
  }
  const q = query(
    collection(db, HOUSEHOLDS),
    where("memberEmails", "array-contains", normalizeEmail(email)),
    limit(1),
  );
  return onSnapshot(
    q,
    (snap) => {
      const d = snap.docs[0];
      onData(d ? toHousehold(d.id, d.data()) : null);
    },
    (err) => onError(err as Error),
  );
}

/**
 * Best-effort check that an email isn't already in some other household, so we
 * don't silently break the one-household-per-user rule.
 *
 * Only an admin can actually run this query — the rules stop a plain member
 * from reading households they don't belong to — so for members it returns
 * null (unknown) and the add proceeds. That is the accepted Phase 1 gap: the
 * hard guarantee arrives when addMember moves into a Cloud Function.
 */
async function emailAlreadyInAHousehold(email: string): Promise<boolean | null> {
  if (!db) return null;
  try {
    const snap = await getDocs(
      query(
        collection(db, HOUSEHOLDS),
        where("memberEmails", "array-contains", normalizeEmail(email)),
        limit(1),
      ),
    );
    return !snap.empty;
  } catch {
    return null; // not permitted to check — caller proceeds
  }
}

/** Create a household owned by `ownerEmail`, who becomes its first member. */
export async function createHousehold(name: string, ownerEmail: string): Promise<string> {
  if (!db) throw new Error("Cloud sync is not configured.");
  const owner = normalizeEmail(ownerEmail);
  const ref = await addDoc(collection(db, HOUSEHOLDS), {
    name: name.trim() || "Household",
    memberEmails: [owner],
    ownerEmail: owner,
    createdAt: Date.now(),
  });
  return ref.id;
}

export async function addMember(hid: string, email: string): Promise<void> {
  if (!db) throw new Error("Cloud sync is not configured.");
  const target = normalizeEmail(email);
  if (!target.includes("@")) throw new Error("That doesn't look like an email address.");
  if ((await emailAlreadyInAHousehold(target)) === true) {
    throw new Error(`${target} already belongs to a household.`);
  }
  await updateDoc(doc(db, HOUSEHOLDS, hid), { memberEmails: arrayUnion(target) });
}

export async function removeMember(hid: string, email: string): Promise<void> {
  if (!db) throw new Error("Cloud sync is not configured.");
  await updateDoc(doc(db, HOUSEHOLDS, hid), {
    memberEmails: arrayRemove(normalizeEmail(email)),
  });
}

// ── Budgets ──────────────────────────────────────────────────────────────

export function subscribeBudget(
  hid: string,
  onData: (state: AppState | null) => void,
  onError: (e: Error) => void,
): () => void {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, BUDGETS, hid),
    (snap) => onData(snap.exists() ? (snap.data() as AppState) : null),
    (err) => onError(err as Error),
  );
}

export async function writeBudget(hid: string, state: AppState): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, BUDGETS, hid), state);
}

/**
 * The single shared budget this app had before households existed. Returned so
 * a newly created household can adopt it instead of starting empty. Returns
 * null once it's gone (or for anyone the legacy rule doesn't cover).
 */
export async function readLegacyBudget(): Promise<AppState | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, BUDGETS, LEGACY_BUDGET_ID));
    return snap.exists() ? (snap.data() as AppState) : null;
  } catch {
    return null;
  }
}

export type { User };
