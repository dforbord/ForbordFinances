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
//  protected by Google sign-in + the Firestore security rules in firestore.rules,
//  which only let you read a household you are a member of.
// ─────────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyCgw-GfKkg1znzmqrhsjSe3538N5zmhXBM",
  authDomain: "forbord-financials.firebaseapp.com",
  projectId: "forbord-financials",
  appId: "1:588446050632:web:015481be5ad52e899fab7d",
};

// ─────────────────────────────────────────────────────────────────────────
//  APP ADMINS — the accounts allowed to CREATE a household.
//
//  This is the app-wide "invite-only" gate. Anyone may sign in with Google,
//  but a signed-in user sees nothing until they belong to a household, and
//  only an admin can create one. Everyone else gets in by having their email
//  added to an existing household (Household tab → Add member).
//
//  Keep this in sync with isAdmin() in firestore.rules — the rules are what
//  actually enforce it; this copy only decides what the UI offers.
// ─────────────────────────────────────────────────────────────────────────
export const APP_ADMINS: string[] = ["dkforbord@gmail.com"];

export function isAppAdmin(email: string | null | undefined): boolean {
  return !!email && APP_ADMINS.includes(email.trim().toLowerCase());
}
