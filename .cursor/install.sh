#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for Lumen Financials.
# Installs the Node version pinned in .tool-versions, then project dependencies.
set -euo pipefail

cd "$(dirname "$0")/.."

# --- Node (pinned in .tool-versions) via nvm ---------------------------------
NODE_VERSION="$(sed -n 's/^node[[:space:]]\+//p' .tool-versions | tr -d '[:space:]')"
NODE_VERSION="${NODE_VERSION:-24.16.0}"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

if ! nvm ls "$NODE_VERSION" >/dev/null 2>&1; then
  nvm install "$NODE_VERSION"
fi
nvm use "$NODE_VERSION" >/dev/null
# Ensure the pinned Node wins over any system node earlier on PATH.
export PATH="$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH"

echo "Using node $(node --version) / npm $(npm --version)"

# --- Root app (Vite + React + TypeScript) ------------------------------------
npm install

# --- Optional: Firebase Cloud Functions (live cloud sync) --------------------
# Builds/typechecks without secrets; deploying needs a Firebase login.
( cd functions && npm install )

# --- Optional: Cloudflare Worker (Teller bank-sync proxy, "Option B") --------
# Upstream wrangler peers a newer @cloudflare/workers-types than the repo pins,
# so use --legacy-peer-deps. Running/deploying it needs a Cloudflare account.
( cd worker && npm install --legacy-peer-deps )

echo "Install complete."
