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
  doc,
  onSnapshot,
  setDoc,
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

// One shared household budget lives at budgets/household.
const COLLECTION = "budgets";
const DOC_ID = "household";

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

export function subscribeBudget(
  onData: (state: AppState | null) => void,
  onError: (e: Error) => void,
): () => void {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, COLLECTION, DOC_ID),
    (snap) => onData(snap.exists() ? (snap.data() as AppState) : null),
    (err) => onError(err as Error),
  );
}

export async function writeBudget(state: AppState): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, COLLECTION, DOC_ID), state);
}

export type { User };
