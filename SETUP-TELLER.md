# 🏦 Bank auto-sync with Teller

Pull transactions and balances straight from your bank into Forbord Financials,
instead of downloading statement files. Teller's **Development** environment is
free (real bank data, no bill, up to 100 connected banks).

Everything runs through the same bucketing, category-learning, and
duplicate-skipping as file import — Teller is just an automatic source. Your bank
**access token stays in this browser only** (a dedicated `localStorage` key); it
never goes to Firestore, the synced `budget.json`, or another device.

## Why a proxy is needed

Teller authenticates every real-data call with a **mutual-TLS client
certificate**. That certificate can't live in a browser app, so a tiny proxy
holds it and forwards read-only calls to `api.teller.io`. You pick one:

| | **Option A — Local sidecar** | **Option B — Cloudflare Worker** |
|---|---|---|
| Where the cert lives | On your Mac (`~/.forbord/teller/`) | Uploaded to Cloudflare |
| Works from | The app running locally (`Budget.command`) | Anywhere, incl. the deployed site + phone |
| Cost | Free | Free (Workers free tier) |
| Setup | Drop 2 files in a folder | One `wrangler deploy` |
| Privacy | Data never leaves your Mac | Data transits Cloudflare |

Both expose the **same contract**, so the app code is identical — only the
`proxyUrl` in `src/teller-config.ts` differs. You can even set up A now and B later.

## First, in the Teller dashboard (both options)

1. Sign up at <https://teller.io> and create an application.
2. Copy your **Application ID** (`app_…`).
3. Under **Certificates**, download `certificate.pem` and `private_key.pem`
   (needed for Development/Production; Sandbox needs neither).

Then open **`src/teller-config.ts`** and fill it in once (just like
`firebase-config.ts`): set `applicationId`, and leave `environment` as
`development` for real data. Save — the **Connect a bank** button now appears in
**Log Entries → 🏦 Auto-sync**. There is no in-app setup form; everything the
operator configures lives in that one file.

---

## Option A — Local sidecar (recommended for how you use this app)

1. Put the certificate files here (create the folder if needed):

   ```
   ~/.forbord/teller/certificate.pem
   ~/.forbord/teller/private_key.pem
   ```

   (Outside the repo on purpose, so they can never be committed. To use a
   different location, set `TELLER_CERT` and `TELLER_KEY` env vars.)

2. Launch with **`Budget.command`** as usual — it now also starts the proxy on
   `http://localhost:5181`. You'll see `certificate: loaded ✓` in the terminal.

3. Leave `proxyUrl` in `src/teller-config.ts` as `http://localhost:5181` (default).

4. Click **Connect a bank**, log in through Teller's dialog, then **Sync now**.

Check it's healthy any time: <http://localhost:5181/health>.

---

## Option B — Cloudflare Worker

Requires a free Cloudflare account.

```bash
cd worker
npm install

# Upload the certificate to Cloudflare (returns a certificate_id):
npx wrangler mtls-certificate upload \
  --cert /path/to/certificate.pem \
  --key  /path/to/private_key.pem \
  --name teller-client
```

1. Paste the returned `certificate_id` into `worker/wrangler.toml`
   (`mtls_certificates[0].certificate_id`).
2. Confirm `ALLOWED_ORIGINS` in `wrangler.toml` lists your app origins.
3. Deploy:

   ```bash
   npx wrangler deploy
   ```

4. Copy the deployed URL (e.g. `https://forbord-teller-proxy.<you>.workers.dev`)
   into `proxyUrl` in `src/teller-config.ts`.
5. **Connect a bank** → **Sync now**.

---

## Notes & gotchas

- **Free tier:** use the **Development** environment for real data at no cost
  (hard cap 100 connected banks). **Sandbox** returns fake data and needs no
  certificate — handy for a dry run of the flow.
- **Re-auth:** bank connections occasionally expire. A sync then fails with
  "needs to be re-authorized" — click **Reconnect** on that bank.
- **Pending transactions** are skipped by default (they can still change). Tick
  *include pending* if you want them; dedup by Teller's stable transaction id
  means a pending→posted transition won't double-import.
- **Credit cards:** the app assumes checking/savings sign conventions (negative
  = money out). If you connect a credit card, sanity-check the first sync.
- **Overlap with file import:** transactions you already imported from a file
  are matched by date+amount+description; if a few slip through as duplicates
  after switching to Teller, set them to *Ignore* in the review table once.
- The certificate and `worker/` build state are git-ignored — never commit them.
