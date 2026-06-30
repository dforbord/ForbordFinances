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

- Saved automatically on every change to your browser's **localStorage**, at the
  origin `http://localhost:5180`. It stays there across restarts, reboots, and
  app relaunches — that's why the port is pinned to 5180.
- It's tied to **this browser on this Mac**. Two things to know:
  - Clearing browser data / "cookies and site data" for localhost would erase it.
  - A different browser = different storage. Pick one browser and stick with it.
- **Back it up:** the **Backup** tab exports a `.json` file with everything.
  Do this now and then and keep the file in iCloud/Drive. That file is your
  portable, permanent copy and restores in one click via Import.

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
