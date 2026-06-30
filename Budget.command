#!/bin/bash
# Double-click this file to launch the Budget app.
# It starts the local server and opens your browser automatically.
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

echo "Starting Budget at http://localhost:5180 …"
echo "Leave this window open while you use the app. Close it to quit."
npm run dev
