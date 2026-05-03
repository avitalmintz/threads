#!/usr/bin/env bash
# Deploy to production AND re-point read-receipts-app.vercel.app at the
# new deployment. Vercel's custom aliases don't auto-track production, so
# without this step every deploy leaves the friendly URL pointing at the
# previous (now-protected) build.
#
# Usage: ./scripts/deploy.sh

set -euo pipefail

cd "$(dirname "$0")/.."

# Deploy and capture the JSON result so we can grab the deployment URL.
RESULT=$(./node_modules/.bin/vercel deploy --prod --yes 2>&1)
echo "$RESULT" | tail -20

# Pluck the deployment URL out of the JSON envelope Vercel prints.
DEPLOYMENT_URL=$(echo "$RESULT" | grep -oE 'https://threads-[a-z0-9]+-avitalmintzs-projects\.vercel\.app' | head -1)

if [ -z "$DEPLOYMENT_URL" ]; then
  echo "Couldn't find deployment URL in vercel output; alias not updated."
  exit 1
fi

# Strip the https:// for the alias source field.
SOURCE="${DEPLOYMENT_URL#https://}"
echo ""
echo "Pointing read-receipts-app.vercel.app at $SOURCE..."
./node_modules/.bin/vercel alias set "$SOURCE" read-receipts-app.vercel.app

echo ""
echo "Done. Live at https://read-receipts-app.vercel.app"
