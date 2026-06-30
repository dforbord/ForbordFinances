#!/bin/bash
# Nightly backup of the live budget file into Downloads/NightlySync_ForbordFinance.
# Only writes a new backup when the data actually CHANGED since the last backup
# (content hash compare) — so untouched days produce nothing.
#
# Run automatically by the LaunchAgent installed via install-nightly-sync.command.

SRC="$HOME/ForbordFinance/budget.json"
BACKUP_DIR="$HOME/Downloads/NightlySync_ForbordFinance"
PREFIX="ForbordFinance"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$SRC" ]; then
  echo "$(date '+%Y-%m-%d %H:%M'): no live file at $SRC — skipping"
  exit 0
fi

current_hash="$(shasum -a 256 "$SRC" | awk '{print $1}')"
latest="$(ls -t "$BACKUP_DIR/$PREFIX-"*.json 2>/dev/null | head -1)"

if [ -n "$latest" ]; then
  last_hash="$(shasum -a 256 "$latest" | awk '{print $1}')"
  if [ "$current_hash" = "$last_hash" ]; then
    echo "$(date '+%Y-%m-%d %H:%M'): no edits since last backup — skipping"
    exit 0
  fi
fi

dest="$BACKUP_DIR/$PREFIX-$(date '+%Y-%m-%d').json"
cp "$SRC" "$dest"
echo "$(date '+%Y-%m-%d %H:%M'): backed up to $dest"
