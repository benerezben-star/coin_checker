#!/usr/bin/env bash
#
# Publish the phone app to https://benerezben-star.github.io/coin_checker/
#
# The live site is the `gh-pages` branch, which holds the *contents* of phone/
# at its root (index.html at the top, not phone/index.html). That mapping is
# maintained with `git subtree`, so gh-pages keeps a real history instead of
# being clobbered on each deploy.
#
# Usage:
#   ./deploy.sh                 deploy, with a default commit message
#   ./deploy.sh "why I changed" deploy, with your own commit message
#   ./deploy.sh --dry-run       show exactly what would happen, change nothing

set -euo pipefail
cd "$(dirname "$0")"

DRY_RUN=0
MESSAGE=""
case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  "")        MESSAGE="Update coin checker" ;;
  *)         MESSAGE="$1" ;;
esac

say() { printf '  %s\n' "$*"; }

# --- safety ---------------------------------------------------------------
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "deploy: on branch '$BRANCH', expected 'main'. Not deploying." >&2
  exit 1
fi

echo
echo "  Deploying Coin Checker"
echo

# --- is there anything to do? --------------------------------------------
DIRTY=$(git status --porcelain)
LIVE=$(git ls-remote origin gh-pages | cut -f1)
BUILT=$(git subtree split --prefix=phone main 2>/dev/null | tail -1)

if [ -z "$DIRTY" ] && [ "$BUILT" = "$LIVE" ]; then
  say "Nothing to deploy -- the live site already matches phone/."
  echo
  exit 0
fi

# --- bump the service worker cache version --------------------------------
# The service worker serves cache-first, so a phone with the app installed
# keeps running the OLD code until the cache NAME changes. Forgetting this is
# the easiest way to ship a fix that never actually reaches the phone, so it
# is automatic rather than something to remember.
CURRENT=$(sed -n 's/.*coin-checker-v\([0-9][0-9]*\).*/\1/p' phone/sw.js | head -1)
if [ -z "$CURRENT" ]; then
  echo "deploy: could not read CACHE_VERSION from phone/sw.js" >&2
  exit 1
fi
NEXT=$((CURRENT + 1))

if [ -n "$DIRTY" ]; then
  say "Changes to publish:"
  git status --porcelain | sed 's/^/      /'
  say "Cache version: v$CURRENT -> v$NEXT  (forces installed phones to update)"
else
  say "Working tree clean; re-publishing committed work to gh-pages."
  NEXT=$CURRENT
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  say "--dry-run: stopping here. Nothing was changed, committed, or pushed."
  echo
  exit 0
fi

# --- commit and publish ---------------------------------------------------
if [ -n "$DIRTY" ]; then
  sed -i "s/coin-checker-v$CURRENT/coin-checker-v$NEXT/" phone/sw.js
  git add -A
  git commit -q -m "$MESSAGE"
  say "Committed: $MESSAGE"
fi

git push -q origin main
say "Pushed main"

git subtree push --prefix=phone origin gh-pages
say "Published phone/ to gh-pages"

echo
say "Live at https://benerezben-star.github.io/coin_checker/"
say "On your phone: force-close the app and reopen it. A service worker"
say "update lands on the NEXT launch, not the current one."
echo
