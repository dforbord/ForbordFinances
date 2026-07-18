#!/bin/bash
# Double-click this file to launch the Budget app.
# Starts the local server and opens it in Chrome (needed for save-to-file).
cd "$(dirname "$0")" || exit 1

# Make sure node/npm are on PATH (installed via mise).
export PATH="$HOME/.local/share/mise/shims:$PATH"
if ! command -v npm >/dev/null 2>&1; then
  export PATH="$HOME/.local/share/mise/installs/node/24.16.0/bin:$PATH"
fi

# Install dependencies the first time only.
if [ ! -d node_modules ]; then
  echo "First launch — installing dependencies (one-time)…"
  npm install || { echo "npm install failed"; read -r; exit 1; }
fi

URL="http://localhost:5180"
echo "Starting Budget at $URL …"

# Start the local Teller proxy (Option A) if present. It holds the mTLS client
# certificate on this Mac so bank data never routes through the cloud. Harmless
# if you don't use Teller — it just idles and reports the cert as not installed.
PROXY_PID=""
if [ -f server/teller-proxy.mjs ]; then
  node server/teller-proxy.mjs &
  PROXY_PID=$!
fi

# Start the dev server in the background, wait for it, then open the browser.
npm run dev &
DEV_PID=$!

# Kill both background processes when this window closes.
trap 'kill $DEV_PID $PROXY_PID 2>/dev/null' EXIT

for _ in $(seq 1 50); do
  if curl -s -o /dev/null "$URL"; then break; fi
  sleep 0.2
done

# Prefer Chrome (save-to-file needs it); fall back to default browser.
if open -a "Google Chrome" "$URL" 2>/dev/null; then
  :
elif open -a "Microsoft Edge" "$URL" 2>/dev/null; then
  :
else
  echo "NOTE: Chrome/Edge not found — opening your default browser."
  echo "      Save-to-file only works in Chrome or Edge."
  open "$URL"
fi

echo "Leave this window open while you use the app. Close it to quit."
wait $DEV_PID
