#!/usr/bin/env bash
# Update and open La Cabra Ad Copy Studio — safely.
#  1. Fetches the configured branch (works offline: opens the version you have).
#  2. Backs up the database before anything else.
#  3. Fast-forwards only when that is safe; never discards or overwrites local work.
#  4. Rebuilds whenever the source revision (or local edits) changed, so a stale build is never served.
#  5. Tracks the studio server with its own PID file and restarts only that exact process.
#  6. Explains a port conflict instead of killing anything else.
#  7. Opens the browser only when the rebuilt app answers.
# Usage: scripts/update-and-open.sh [--no-open] [--plan]
set -u
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${STUDIO_BRANCH:-claude/ecstatic-cannon-4z1ek3}"
PORT="${STUDIO_PORT:-3100}"
export STUDIO_DATA_DIR="${STUDIO_DATA_DIR:-$HOME/.la-cabra-ad-copy-studio}"
OPEN=1; PLAN=0
for a in "$@"; do case "$a" in --no-open) OPEN=0 ;; --plan) PLAN=1 ;; esac; done
PIDFILE="$STUDIO_DATA_DIR/studio-server.pid"
LOG="$STUDIO_DATA_DIR/studio-server.log"
REVFILE="$APP_DIR/.next/STUDIO_BUILD_REV"
say() { printf '%s\n' "$*"; }
mkdir -p "$STUDIO_DATA_DIR"
cd "$APP_DIR" || exit 1

# --- 1. fetch (optional when offline)
UPDATE_NOTE=""
if git fetch --quiet origin "$BRANCH" 2>/dev/null; then
  LOCAL=$(git rev-parse HEAD); REMOTE=$(git rev-parse FETCH_HEAD)
  if [ "$LOCAL" = "$REMOTE" ]; then UPDATE_NOTE="Already up to date."
  elif [ -n "$(git status --porcelain --untracked-files=no)" ]; then UPDATE_NOTE="Update available, but this folder has local changes — not updating (nothing was discarded)."
  elif [ "$(git rev-parse --abbrev-ref HEAD)" != "$BRANCH" ]; then UPDATE_NOTE="Not on $BRANCH — not updating."
  elif git merge-base --is-ancestor "$LOCAL" "$REMOTE"; then
    if [ "$PLAN" = 1 ]; then UPDATE_NOTE="Would fast-forward to ${REMOTE:0:7}."
    else
      # --- 2. back up before changing code (migrations may run on next start)
      [ -f "$STUDIO_DATA_DIR/studio.db" ] && node scripts/backup.mjs >/dev/null 2>&1 && say "Database backed up."
      git merge --ff-only --quiet FETCH_HEAD && UPDATE_NOTE="Updated to ${REMOTE:0:7}."
    fi
  elif git merge-base --is-ancestor "$REMOTE" "$LOCAL"; then UPDATE_NOTE="This computer already has newer changes than the online version — keeping them."
  else UPDATE_NOTE="Your copy and the online version have diverged — not updating automatically (nothing was discarded)."
  fi
else
  UPDATE_NOTE="Offline or GitHub unreachable — opening the version on this computer."
fi
say "$UPDATE_NOTE"
[ -f "$STUDIO_DATA_DIR/studio.db" ] && [ "$PLAN" = 0 ] && node scripts/backup.mjs >/dev/null 2>&1

# --- 4. rebuild when the source changed
REV="$(git rev-parse HEAD)-$( (git diff HEAD -- . ':!*.md'; git ls-files --others --exclude-standard -- src scripts seed) | shasum | cut -c1-12)"
BUILT="$(cat "$REVFILE" 2>/dev/null || true)"
NEED_BUILD=0
[ "$REV" != "$BUILT" ] && NEED_BUILD=1
[ ! -f "$APP_DIR/.next/BUILD_ID" ] && NEED_BUILD=1
if [ "$PLAN" = 1 ]; then
  [ "$NEED_BUILD" = 1 ] && say "PLAN: rebuild needed (built: ${BUILT:-none}, source: $REV)" || say "PLAN: build is current ($REV)"
  exit 0
fi
if [ "$NEED_BUILD" = 1 ]; then
  say "Preparing the new version (this can take a minute)…"
  if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then npm install --no-audit --no-fund >/dev/null 2>&1 || { say "Could not install dependencies. Check the internet connection."; exit 1; }; fi
  npm run build >"$STUDIO_DATA_DIR/last-build.log" 2>&1 || { say "Build failed — see $STUDIO_DATA_DIR/last-build.log. The previous version was not started."; exit 1; }
  printf '%s' "$REV" > "$REVFILE"
fi

# --- 5. restart only our own server
OURS=""
if [ -f "$PIDFILE" ]; then
  P=$(cat "$PIDFILE")
  if kill -0 "$P" 2>/dev/null && ps -p "$P" -o command= 2>/dev/null | grep -q "next"; then OURS="$P"; fi
fi
if [ -n "$OURS" ]; then
  pkill -TERM -P "$OURS" 2>/dev/null; kill -TERM "$OURS" 2>/dev/null
  for i in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$OURS" 2>/dev/null || break; sleep 0.5; done
  rm -f "$PIDFILE"
fi
# --- 6. port conflict?
if (command -v lsof >/dev/null && lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1) || curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/"; then
  say "Port $PORT is already used by another program (not the studio started by this script)."
  say "Close that program (or restart the computer) and try again. Nothing was stopped."
  exit 2
fi
nohup node node_modules/next/dist/bin/next start -H 127.0.0.1 -p "$PORT" >"$LOG" 2>&1 &
echo $! > "$PIDFILE"

# --- 7. open only when ready
for i in $(seq 1 60); do
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/api/status"; then
    say "La Cabra Ad Copy Studio is running: http://localhost:$PORT  (version $(git rev-parse --short HEAD))"
    if [ "$OPEN" = 1 ]; then (command -v open >/dev/null && open "http://localhost:$PORT") || (command -v xdg-open >/dev/null && xdg-open "http://localhost:$PORT") || true; fi
    exit 0
  fi
  sleep 1
done
say "The studio did not start in time — see $LOG"
exit 1
