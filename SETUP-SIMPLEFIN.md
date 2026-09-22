# 🏦 Bank auto-sync with SimpleFIN

Transactions arrive on their own each morning — no statements to download.
Each person connects their own bank once; from then on a scheduled Cloud
Function pulls their transactions and files them into their household budget
using the same bucketing and duplicate-skipping as file import.

## How it fits together

```
browser ──setup token──► claimConnection (Cloud Function)
                              │ claims the token → access URL
                              ▼
                         connections/{uid}        ← SERVER ONLY
                         connectionStatus/{uid}   ← safe status for the UI
                              ▲
                         dailyRefresh (5am America/Denver)
                              │ one pull per connection
                              ▼
                         budgets/{householdId}
```

The SimpleFIN **access URL is a bearer credential** for reading someone's bank
data. It is written only to `connections/{uid}`, which `firestore.rules` denies
to *every* client; the functions reach it with the Admin SDK, which bypasses
rules. It is never returned to the browser and never logged.

## What the operator does once

1. **Upgrade the Firebase project to the Blaze plan.** Cloud Functions and
   Cloud Scheduler require it. At this scale it stays inside the free
   allowance — set a low budget alert anyway.
2. Deploy:

   ```bash
   firebase deploy --only functions,firestore:rules
   ```

   The first functions deploy also enables the scheduler and asks to enable a
   few Google APIs; accept them.

## What each user does once (~10 minutes)

1. **Log Entries → 🏦 Auto-sync → Connect a bank.**
2. Open SimpleFIN, create an account, **subscribe ($15/year, paid to them)**,
   and connect their bank(s) — bank login and any 2FA happen on SimpleFIN's
   site, never here.
3. In SimpleFIN: **My Account → Apps → New app connection**, name it
   *Forbord Financials*, **Create Setup Token**.
4. Paste that token back into the app and press **Connect**. The first sync
   runs immediately; after that it's automatic.

SimpleFIN **cannot be embedded** — it has no iframe support and no OAuth
callback — so that one hand-off is unavoidable by design. Everything after it
is invisible.

## Notes & gotchas

- **Optional.** Nobody has to connect a bank. Manual entry and CSV/OFX import
  work exactly as before, and a household can mix synced and unsynced members.
- **Rate limit ~24 requests/day** per connection. `dailyRefresh` makes exactly
  one, and **Sync now** one more — never poll.
- **Range is 45 days, not 90.** The docs say 90, but the live API answers an
  89-day query with *"Requested date range exceeds recommended range of 45
  days. In the future, this may be capped."* Deeper history still comes from
  file import.
- **Refreshes about once a day** upstream, so "Sync now" twice in a row won't
  produce new data.
- **Transaction ids are unique only within an account.** Real data collides
  across accounts — the demo returns id `1790064000` on both Savings
  (-110.00) and Checking (-143.39) — so ids are stored scoped as
  `sfin:<accountId>:<txnId>`. Don't "simplify" that back to a bare id; it
  silently discards real transactions.
- **Duplicates** are skipped two ways: by that scoped source id, and by the
  same content fingerprint a CSV upload writes — so importing a statement by
  hand and syncing the same week won't double-count.
- **Anything unclassifiable** is parked in an `Uncategorized` bucket rather
  than dropped, so it's visible and can be re-filed.
- **Expired connections** show a *Reconnect* button; create a fresh setup token
  in SimpleFIN and paste it in.
- **Testing without a bank:** SimpleFIN publishes a demo setup token at
  <https://beta-bridge.simplefin.org/info/developers> that returns fake
  accounts. Claiming it costs nothing and needs no subscription.
