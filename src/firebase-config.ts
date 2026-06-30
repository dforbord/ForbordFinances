// ─────────────────────────────────────────────────────────────────────────
//  LIVE CLOUD SYNC CONFIG  (see SETUP-SYNC.md for the full walkthrough)
//
//  • Leave these BLANK  → the app runs 100% locally on each machine (no sync,
//    no sign-in) — exactly as it does today.
//  • Paste your Firebase web-app config → you + your wife share ONE budget that
//    syncs live between both laptops, behind a Google sign-in restricted to the
//    emails listed below.
//
//  The apiKey here is NOT a secret (it's safe in the shipped app). Your data is
//  protected by Google sign-in + the Firestore security rules in SETUP-SYNC.md,
//  which only allow the two email addresses below.
// ─────────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: "",
};

// The Google accounts allowed to open the shared budget. Put the SAME two
// emails in your Firestore security rules (see SETUP-SYNC.md).
export const ALLOWED_EMAILS: string[] = [
  // "you@gmail.com",
  // "wife@gmail.com",
];
