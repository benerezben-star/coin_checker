---
description: Publish the Coin Checker phone app to its live GitHub Pages URL
---

Deploy the phone app to https://benerezben-star.github.io/coin_checker/

Run from the repo root:

```
./deploy.sh "short description of what changed"
```

The script bumps the service worker cache version, commits, pushes `main`, and
publishes `phone/` to `gh-pages` via `git subtree`. Use `./deploy.sh --dry-run`
to preview without changing anything.

Rules:
- Never hand-edit `CACHE_VERSION` in `phone/sw.js` — the script bumps it.
- Only `phone/` reaches the phone; anything else is repo bookkeeping.
- Syntax-check first, since there is no build step or test suite:
  `for f in phone/js/*.js phone/sw.js; do node --input-type=module --check < "$f" || echo "FAIL $f"; done`

Afterwards, tell the user to force-close the app on their phone and reopen it
twice — a service worker update lands on the launch after next.
