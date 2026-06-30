#!/bin/bash
# Double-click to install the nightly backup job (runs at 11:45 PM).
# Safe to run again any time — it reinstalls cleanly.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SYNC_SCRIPT="$SCRIPT_DIR/nightly-sync.sh"
LIVE_DIR="$HOME/Documents/Sync_ForbordFinances"
BACKUP_DIR="$HOME/Downloads/NightlySync_ForbordFinance"
LABEL="com.forbord.budget.nightlysync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$LIVE_DIR" "$BACKUP_DIR" "$HOME/Library/LaunchAgents"
chmod +x "$SYNC_SCRIPT"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SYNC_SCRIPT</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>23</integer>
    <key>Minute</key><integer>45</integer>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$BACKUP_DIR/.sync.log</string>
  <key>StandardErrorPath</key><string>$BACKUP_DIR/.sync.log</string>
</dict>
</plist>
EOF

# Reload the agent.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST"

echo ""
echo "✅ Nightly backup installed (daily at 11:45 PM, plus at each login/wake)."
echo "   Live file it watches : $LIVE_DIR/budget.json"
echo "   Backups go to        : $BACKUP_DIR"
echo "   Log                  : $BACKUP_DIR/.sync.log"
echo ""
echo "   In the app's Backup tab, save your data file as:"
echo "       $LIVE_DIR/budget.json"
echo ""
read -r -p "Done. Press Return to close."
