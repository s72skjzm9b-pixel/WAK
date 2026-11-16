#!/usr/bin/env bash
# Double-click to update (when safe) and open La Cabra Ad Copy Studio.
# Copy this file to wherever you keep your launcher, and adjust the two paths if needed.
REPO="${STUDIO_REPO:-$HOME/Documents/Codex/WAK/ad-copy-studio}"
export STUDIO_DATA_DIR="${STUDIO_DATA_DIR:-$HOME/Documents/Codex/La-Cabra-Studio-Data}"
"$REPO/scripts/update-and-open.sh"
echo; read -r -p "Press Enter to close this window (the studio keeps running)…" _
