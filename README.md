# Coin Checker

A local tool for hunting errors in your coin collection and keeping track of
what you've already looked at. Runs entirely on your own machine — nothing is
uploaded anywhere.

## Running it

```
pip install -r requirements.txt
python run.py
```

It opens `http://127.0.0.1:5000` in your browser. Press Ctrl+C in the terminal
to stop it.

## Using it from your phone

```
python run.py --lan
```

It prints an address like `http://192.168.86.21:5000` — type that into your
phone's browser. The layout adapts to a phone screen, and the checklist buttons
are sized for thumbs.

Requirements and caveats:

- Phone and PC must be on the **same Wi-Fi**, and the PC must stay on with the
  terminal window open. The app runs on the PC; the phone is just a screen.
- The **first run pops a Windows Firewall dialog** — allow it on Private
  networks. If you miss it, the phone will just time out.
- Your phone's camera works for uploads. Tapping the file picker offers
  "Take Photo", so you can shoot a coin and log it without moving files around.
- **There is no password on the app.** On your home Wi-Fi that's usually fine,
  but anyone else on the network could open it, so don't run `--lan` on public
  or shared Wi-Fi. Plain `python run.py` stays local to the PC.

Do not expose this to the open internet with a tunnel service. With no
authentication, anyone who found the URL would have full delete access to your
collection.

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
pass/suspect marks save as you click, so you can stop mid-coin and come back.

**4. Image workbench.** Eight enhancement filters (relief, edge detection,
unsharp mask, histogram equalize, and others) with two panes side by side, so
you can put a suspect coin next to a known-normal one at the same zoom.

**5. Collection catalog.** Every coin with its photos, grade, findings, notes,
and estimated value. Filter, search, and export to CSV.

## What it deliberately does not do

**It will not tell you whether a photo shows a doubled die.** Machine doubling
and a true doubled die look nearly identical to an algorithm, and one is
worthless while the other can be worth thousands. A confident wrong answer
there would cost you real money, so the tool sharpens the image and teaches you
the distinction instead of guessing. Every coin page carries that comparison,
and the "Doubling guide" tab in Reference has it in full.

## What you need

- **A 0.01g digital scale** (~$15). This is the single highest-value addition —
  it's the only check here that can identify an error on its own.
- **Digital calipers** (~$15) for diameter. Optional but catches broadstrikes.
- **A magnet.** Any fridge magnet works.
- **Your microscope**, for everything visual.

If your microscope saves image files to your PC, just upload them. If it only
does live video, you can screenshot the preview window and upload that.

## Your data

Everything lives in the `instance/` folder:

- `coins.db` — SQLite database of your collection
- `photos/` — original uploads, untouched
- `thumbs/`, `cache/` — regenerated automatically, safe to delete

Back up `instance/` and you've backed up everything. Use **Export CSV** for a
copy you can open in Excel.

## Adding to the reference data

The three JSON files in `app/data/` are plain data — no code changes needed:

- `us_specs.json` — weights, diameters, tolerances, compositions.
  **To support foreign coins**, add entries here with the country's specs and
  the automatic weight checking starts working for them.
- `varieties.json` — known errors and varieties by year and mint mark.
- `error_types.json` — the inspection checklist.

A variety entry matches on an explicit `years` list, or on a `year_range` for
ones that span a whole series.

## A note on the value figures

The `value_note` figures are rough ballparks to help you triage — they are not
appraisals and they go stale. Check recent sold listings (Heritage Auctions,
GreatCollections, eBay *sold* prices) before acting on anything, and get
genuinely significant finds authenticated by PCGS, NGC, or ANACS. Never clean a
coin you think might be valuable; it destroys most of the value.
