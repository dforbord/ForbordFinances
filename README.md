# 💰 Budget

A fully local, single-user budgeting app. No accounts, no server, no monthly
fee. Your data stays on this Mac.

## Launch it (fast way)

**Double-click `Budget.command`** in the project folder. It starts the app and
opens your browser to http://localhost:5180. Leave that little terminal window
open while you use it; close it to quit.

First launch installs dependencies once; after that it starts in well under a
second.

> Tip: drag `Budget.command` to your Dock or make a Desktop alias for one-click
> access. (If macOS blocks it the first time, right-click → Open.)

### Or from a terminal

```bash
cd ~/budget
npm run dev
```

## Where your data lives & how it persists

Three layers, strongest first:

Everything lives under **`~/Desktop/ForbordFinances/`**:
`Sync_ForbordFinances/` holds the live file, `NightlySync_ForbordFinance/` holds
the dated backups.

1. **Auto-save to a real file (recommended).** In the **Backup** tab, click
   *Create / choose data file* and save it as
   **`~/Desktop/ForbordFinances/Sync_ForbordFinances/budget.json`**.
   From then on, every edit writes to that file automatically. This needs
   **Chrome or Edge** (Safari/Firefox can't do it), and you click once per launch
   to re-grant access. `Budget.command` opens Chrome for this reason.
2. **Nightly backup.** A macOS background job copies that `budget.json`
   into **`~/Desktop/ForbordFinances/NightlySync_ForbordFinance/`** as
   `ForbordFinance-YYYY-MM-DD.json` — but **only when the data changed** since the
   last backup (content compare, so untouched days produce nothing).
   - **Runs** nightly at **11:45 PM**, and also at **login/wake** so a night the
     Mac was asleep or powered off gets caught up the next time it's on.
   - **Retention:** keeps the **last 7 daily** backups plus the **most recent
     backup of each earlier month**, forever; older dailies are pruned.
   - Install/remove with the double-click scripts in `scripts/`:
     `install-nightly-sync.command` and `uninstall-nightly-sync.command`.
   - Activity log: `~/Desktop/ForbordFinances/NightlySync_ForbordFinance/.sync.log`.
3. **Browser localStorage** (always on). Instant-load cache at the pinned origin
   `http://localhost:5180`, so the app works offline and loads fast even before
   you reconnect the file. Tied to one browser on this Mac; clearing site data
   erases this layer (but your file + nightly backups are safe).

You can also grab a manual snapshot any time via **Backup → Export**.

### Optional: live cloud sync (share with another person)

Want it on a free hosted URL that syncs live between two people (e.g. you + your
spouse), behind a Google sign-in? Follow **[SETUP-SYNC.md](SETUP-SYNC.md)** —
it's free on Firebase's tier. Until you paste your keys into
`src/firebase-config.ts`, the app stays fully local with no sign-in.

## The app

- **Dashboard** — income vs. expenses / taxes / savings + what's left to
  allocate; two weekly trend charts (net income and spending, last 8 weeks, the
  current week a running total); a quick Goals widget; and click-to-expand
  planned-vs-actual breakdowns per bucket type.
- **Log Entries** — an *Import from bank* drop zone (CSV / OFX / QFX from Chase,
  Wells Fargo, Schwab): spending is auto-sorted into your buckets (and it learns
  your categories), deposits become income, duplicates are skipped. Below it,
  manual income/expense entry and your buckets.
- **Goals** — set a target amount + date and log savings manually with *Add to
  goal*. Monthly model:
  - **Monthly goal** (fixed) = (target − already-saved) ÷ months in the plan.
  - **Save this month** = what it takes to reach the end-of-month checkpoint =
    the monthly goal **+ any shortfall carried in** (so a short November makes
    December's number = standard + the gap).
  - Progress-bar **marker** steps to the cumulative month-end target each month;
    only *saved of target* animates. Plus an **ahead / on track / behind** read.
- **Expense Calendar** — plan future one-off costs (travel, events) on a monthly
  calendar. Click a day to add an item, or block off a multi-day range for a
  single expense; each entry is filed into a bucket you choose.
- **Buckets** — create/edit/delete your own expense, tax, and savings categories.
- **Savings** — accounts whose balances grow as you log contributions.
- **Backup** — export/import your data; reset to defaults.

## Code

Vite + React + TypeScript, no backend. Node is pinned via `.tool-versions`
(24.16.0). Source lives in `src/`. Stored in a private GitHub repo on your
personal account.
