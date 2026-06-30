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

1. **Auto-save to a real file (recommended).** In the **Backup** tab, click
   *Create / choose data file* and save it as **`~/ForbordFinance/budget.json`**.
   From then on, every edit writes to that file automatically. This needs
   **Chrome or Edge** (Safari/Firefox can't do it), and you click once per launch
   to re-grant access. `Budget.command` opens Chrome for this reason.
2. **Nightly backup.** A macOS background job copies `~/ForbordFinance/budget.json`
   into **`~/Downloads/NightlySync_ForbordFinance/`** as
   `ForbordFinance-YYYY-MM-DD.json` — but **only when the data changed** since the
   last backup (content compare, so untouched days produce nothing).
   - **Runs** nightly at **11:45 PM**, and also at **login/wake** so a night the
     Mac was asleep or powered off gets caught up the next time it's on.
   - **Retention:** keeps the **last 7 daily** backups plus the **most recent
     backup of each earlier month**, forever; older dailies are pruned.
   - Install/remove with the double-click scripts in `scripts/`:
     `install-nightly-sync.command` and `uninstall-nightly-sync.command`.
   - Activity log: `~/Downloads/NightlySync_ForbordFinance/.sync.log`.
3. **Browser localStorage** (always on). Instant-load cache at the pinned origin
   `http://localhost:5180`, so the app works offline and loads fast even before
   you reconnect the file. Tied to one browser on this Mac; clearing site data
   erases this layer (but your file + nightly backups are safe).

You can also grab a manual snapshot any time via **Backup → Export**.

## The app

- **Dashboard** — income vs. expenses / taxes / savings + what's left to
  allocate, with planned-vs-actual bars per bucket.
- **Monthly Entry** — log income and spending for any month (‹ › to switch).
- **Buckets** — create/edit/delete your own expense, tax, and savings categories.
- **Savings** — accounts whose balances grow as you log contributions.
- **Backup** — export/import your data; reset to defaults.

## Code

Vite + React + TypeScript, no backend. Node is pinned via `.tool-versions`
(24.16.0). Source lives in `src/`. Stored in a private GitHub repo on your
personal account.
