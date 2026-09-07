---
name: deploy
description: Publish the Coin Checker phone app to its live GitHub Pages URL. Use when the user says "deploy", "push it live", "update my phone", or asks for changes to reach their phone.
---

# Deploy Coin Checker

The user runs this app on an Android phone as an installed PWA from
https://benerezben-star.github.io/coin_checker/

## How to deploy

Run the script from the repo root:

```
./deploy.sh "short description of what changed"
```

It handles everything: bumping the service worker cache version, committing,
pushing `main`, and publishing `phone/` to the `gh-pages` branch via
`git subtree`.

Use `./deploy.sh --dry-run` first if you want to show the user what would be
published without changing anything.

## Rules

- **Never hand-edit `CACHE_VERSION` in `phone/sw.js`.** The script bumps it.
  Bumping it yourself as well double-bumps and muddies the history.
- **Only `phone/` reaches the phone.** Anything outside it is repo bookkeeping
  and will not affect the live app.
- Verify JS before deploying — there is no build step or test suite, so a
  syntax error ships straight to the phone:
  ```
  for f in phone/js/*.js phone/sw.js; do node --input-type=module --check < "$f" || echo "FAIL $f"; done
  ```

## After deploying

Tell the user to **force-close the app on their phone and reopen it**. The
service worker installs an update on the *next* launch, so the first reopen
after a deploy still shows the old version — a second reopen shows the new one.
