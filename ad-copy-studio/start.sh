#!/usr/bin/env bash
# Start La Cabra Ad Copy Studio on http://localhost:3100 (this computer only).
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
[ -d .next ] && [ .next/BUILD_ID -nt package.json ] || npm run build
npm start
