# Coin Checker

A tool for hunting errors in your coin collection and keeping track of what
you've already looked at. It runs entirely on your phone — nothing is uploaded
anywhere, and it works with no signal at all.

**Live at:** https://benerezben-star.github.io/coin_checker/

## Installing it on your phone

Open the link in Chrome on Android, then **⋮ → Add to Home screen**. It
installs as a normal app icon, opens without browser chrome, and works offline
from then on — the whole app is cached on the device.

To update after a change is deployed, force-close the app and reopen it. A
service worker update lands on the *next* launch, not the current one.

## What it does

**1. Measurement analysis — the part that can actually decide something.**
Enter a weight and the tool compares it against official US Mint specs and
tells you what an off-spec reading probably means:

- **Wrong planchet / off-metal** — if your 2005 cent weighs 2.27g, that's the
  weight of a dime planchet, and the tool says so. It only flags candidates
  that are physically possible: a planchet bigger than the collar can't be
  struck in it, and it accounts for whether that planchet even existed then.
- **Missing clad layer** — a quarter at 4.7g instead of 5.67g.
- **Silver vs. clad** — tells a 24.59g silver Eisenhower from a 22.68g clad one.
- **1982 cents** — the transition year where weight is the *only* way to
  separate 3.11g bronze from 2.50g zinc.
- **Magnet mismatches** — including the 1943 copper cent test.
- **Broadstrikes** — via diameter.

**2. Known-variety lookup.** Enter year + mint mark and it lists the catalogued
varieties for that exact coin, with where to look, what magnification you need,
what it's roughly worth, and what commonly fakes it. 41 varieties across cents,
nickels, dimes, quarters, halves, and dollars.

**3. Guided inspection checklist.** 26 checks in five steps, from whole-coin
tests that need no microscope through zone-by-zone work at 20–40x. Your
pass/suspect marks save as you tap, so you can stop mid-coin and come back.

**4. Image workbench.** Eight enhancement filters (relief, edge detection,
unsharp mask, histogram equalize, and others) with two panes side by side, so
you can put a suspect coin next to a known-normal one at the same zoom.

**5. Collection catalog.** Every coin with its photos, grade, findings, notes,
and estimated value. Filter, search, and export to CSV.

Your phone's camera works for photos — the file picker offers "Take Photo", so
you can shoot a coin and log it without moving files around.

## What it deliberately does not do

**It will not tell you whether a photo shows a doubled die.** Machine doubling
and a true doubled die look nearly identical to an algorithm, and one is
worthless while the other can be worth thousands. A confident wrong answer
there would cost you real money, so the tool sharpens the image and teaches you
the distinction instead of guessing. Every coin page carries that comparison,
and the Reference page has it in full.

## What you need

- **A 0.01g digital scale** (~$15). This is the single highest-value addition —
  it's the only check here that can identify an error on its own.
- **Digital calipers** (~$15) for diameter. Optional but catches broadstrikes.
- **A magnet.** Any fridge magnet works.
- **Your microscope**, for everything visual.

If your microscope saves image files, transfer them to the phone and upload
them. If it only does live video, photograph the preview screen.

## Your data

Everything lives in your phone's browser storage (IndexedDB) and never leaves
the device. **This is the only copy.** If you lose the phone, clear the
browser's site data, or uninstall the app, it is gone.

So use **Backup → Export backup (with photos)** regularly and keep the JSON
file somewhere else. **Export CSV** gives you a spreadsheet copy of the coin
records without the photos. Restoring adds coins alongside what's already
there — an import never overwrites or deletes existing coins.

## Adding to the reference data

The three JSON files in `phone/data/` are plain data — no code changes needed:

- `us_specs.json` — weights, diameters, tolerances, compositions.
  **To support foreign coins**, add entries here with the country's specs and
  the automatic weight checking starts working for them.
- `varieties.json` — known errors and varieties by year and mint mark.
- `error_types.json` — the inspection checklist.

A variety entry matches on an explicit `years` list, or on a `year_range` for
ones that span a whole series.

## Deploying a change

```
./deploy.sh
```

It bumps the service worker cache version (without that, installed phones keep
serving the old code), commits, and publishes `phone/` to the `gh-pages`
branch, which is what the live URL serves. See `deploy.sh` for details.

## A note on the value figures

The `value_note` figures are rough ballparks to help you triage — they are not
appraisals and they go stale. Check recent sold listings (Heritage Auctions,
GreatCollections, eBay *sold* prices) before acting on anything, and get
genuinely significant finds authenticated by PCGS, NGC, or ANACS. Never clean a
coin you think might be valuable; it destroys most of the value.
