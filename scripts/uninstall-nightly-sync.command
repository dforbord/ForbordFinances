#!/bin/bash
# Double-click to remove the nightly backup job.
# Your existing backup files in Downloads/NightlySync_ForbordFinance are kept.
LABEL="com.forbord.budget.nightlysync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"

echo "✅ Nightly backup removed. Existing backup files were left in place."
read -r -p "Press Return to close."
