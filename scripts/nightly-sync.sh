#!/bin/bash
# Backup of the live budget file into Downloads/NightlySync_ForbordFinance.
#
# • Only writes a new backup when the data CHANGED since the last one
#   (content hash compare) — untouched days produce nothing.
# • Retention (pruned every run): keep the last 7 daily backups, plus the
#   most recent backup of each earlier month, forever.
#
# Runs from the LaunchAgent installed via install-nightly-sync.command:
#   - nightly at 11:45 PM
#   - and at login/wake (RunAtLoad), to catch nights the Mac was off.
# Written for macOS /bin/bash 3.2 (no associative arrays).

SRC="$HOME/ForbordFinance/budget.json"
BACKUP_DIR="$HOME/Downloads/NightlySync_ForbordFinance"
PREFIX="ForbordFinance"
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR"

prune() {
  ( cd "$BACKUP_DIR" 2>/dev/null || exit 0
    files=$(ls "$PREFIX-"????-??-??.json 2>/dev/null)
    [ -z "$files" ] && exit 0

    # Oldest date allowed by the daily window (today minus KEEP_DAYS-1).
    cutoff_epoch=$(date -j -f "%Y-%m-%d" "$(date -v-$((KEEP_DAYS - 1))d +%Y-%m-%d)" +%s 2>/dev/null)

    # The latest file in each month is kept forever.
    keep_monthly=""
    months=$(printf '%s\n' "$files" \
      | sed -E "s/^$PREFIX-([0-9]{4}-[0-9]{2})-[0-9]{2}\.json$/\1/" | sort -u)
    for m in $months; do
      latest=$(ls "$PREFIX-$m-"??.json 2>/dev/null | sort | tail -1)
      keep_monthly="$keep_monthly $latest "
    done

    for f in $files; do
      d=$(printf '%s' "$f" | sed -E "s/^$PREFIX-([0-9]{4}-[0-9]{2}-[0-9]{2})\.json$/\1/")
      f_epoch=$(date -j -f "%Y-%m-%d" "$d" +%s 2>/dev/null)
      # Within the last KEEP_DAYS days → keep.
      if [ -n "$f_epoch" ] && [ -n "$cutoff_epoch" ] && [ "$f_epoch" -ge "$cutoff_epoch" ]; then
        continue
      fi
      # Month's most-recent backup → keep.
      case "$keep_monthly" in
        *" $f "*) continue ;;
      esac
      rm -f "$f" && echo "$(date '+%Y-%m-%d %H:%M'): pruned $f"
    done
  )
}

if [ ! -f "$SRC" ]; then
  echo "$(date '+%Y-%m-%d %H:%M'): no live file at $SRC — skipping"
  prune
  exit 0
fi

current_hash="$(shasum -a 256 "$SRC" | awk '{print $1}')"
latest="$(ls -t "$BACKUP_DIR/$PREFIX-"*.json 2>/dev/null | head -1)"

if [ -n "$latest" ] && [ "$current_hash" = "$(shasum -a 256 "$latest" | awk '{print $1}')" ]; then
  echo "$(date '+%Y-%m-%d %H:%M'): no edits since last backup — skipping"
  prune
  exit 0
fi

dest="$BACKUP_DIR/$PREFIX-$(date '+%Y-%m-%d').json"
cp "$SRC" "$dest"
echo "$(date '+%Y-%m-%d %H:%M'): backed up to $dest"
prune
