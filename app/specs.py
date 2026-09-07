"""Mint-spec lookup and physical-measurement analysis.

This is the part of the tool that can actually *decide* something. Weight and
diameter are objective: a cent that weighs 3.11g in 2005 is off-spec, full stop.
Everything visual is left to the collector's eye and the checklist.
"""

import json
from pathlib import Path

DATA = Path(__file__).parent / "data"

# One clad layer is roughly this fraction of a clad coin's total mass. Reported
# weights for genuine missing-clad-layer quarters (~4.7g vs 5.67g) and dimes
# (~1.9g vs 2.268g) both land near 16-17%.
CLAD_LAYER_FRACTION = 0.165

# How far past a series' end date a leftover planchet might plausibly survive
# in a mint bin and get struck by mistake.
PLANCHET_CARRYOVER_YEARS = 5


def _load(name):
    with open(DATA / name, encoding="utf-8") as fh:
        return json.load(fh)


def _fmt(value, min_places):
    """Trim trailing zeros but keep a minimum precision.

    JSON has no way to say "5.00", so a whole-number weight arrives as 5.0 and
    would print as a bare "5g" in a context where every other figure carries
    decimals. This keeps the display uniform (and matches the phone version's
    formatting exactly).
    """
    text = f"{value:.3f}".rstrip("0")
    whole, _, frac = text.partition(".")
    return f"{whole}.{frac.ljust(min_places, '0')}"


def _g(value):
    return _fmt(value, 2)


def _mm(value):
    return _fmt(value, 1)


_SPECS = _load("us_specs.json")["series"]


def all_series():
    return _SPECS


def denominations():
    seen = []
    for s in _SPECS:
        if s["denomination"] not in seen:
            seen.append(s["denomination"])
    return seen


def find_specs(denomination, year, is_proof=False):
    """Every spec that legitimately applies to this denomination and year.

    Usually one. Sometimes several -- a 1982 cent can legitimately be either
    3.11g bronze or 2.50g zinc, and both are correct.
    """
    if not denomination or not year:
        return []
    matches = [
        s
        for s in _SPECS
        if s["denomination"] == denomination and s["year_start"] <= year <= s["year_end"]
    ]
    if not is_proof:
        matches = [s for s in matches if not s.get("proof_only")]
    return matches


def _in_tolerance(weight, spec):
    return abs(weight - spec["weight_g"]) <= spec["tolerance_g"]


def _planchet_candidates(weight, coin_year, target_diameter, exclude_ids):
    """Other series whose planchet weight matches what was actually measured."""
    out = []
    for s in _SPECS:
        if s["id"] in exclude_ids:
            continue
        if not _in_tolerance(weight, s):
            continue

        # A planchet larger than the collar physically cannot be struck in it.
        fits = target_diameter is None or s["diameter_mm"] <= target_diameter + 0.5
        era_ok = coin_year is None or (
            s["year_start"] <= coin_year <= s["year_end"] + PLANCHET_CARRYOVER_YEARS
        )

        out.append(
            {
                "spec": s,
                "fits_collar": fits,
                "era_plausible": era_ok,
                "plausible": fits and era_ok,
            }
        )
    # Most plausible first.
    out.sort(key=lambda c: (not c["plausible"], abs(weight - c["spec"]["weight_g"])))
    return out


def analyze(denomination, year, weight_g=None, diameter_mm=None,
            is_magnetic=None, is_proof=False):
    """Compare measurements against mint specs.

    Returns a dict with a verdict and a list of findings. Each finding has a
    level: 'ok', 'info', 'warn' (worth a closer look), or 'alert' (off-spec in
    a way that suggests a real error).
    """
    result = {
        "specs": find_specs(denomination, year, is_proof),
        "findings": [],
        "verdict": "no_data",
    }
    specs = result["specs"]

    if not specs:
        result["findings"].append(
            {
                "level": "info",
                "title": "No spec on file",
                "detail": "This tool only carries US mint specs so far. Record the "
                          "weight and diameter anyway -- the data is still useful, and "
                          "specs for other countries can be added later.",
            }
        )
        return result

    if len(specs) > 1:
        result["findings"].append(
            {
                "level": "info",
                "title": f"{len(specs)} legitimate compositions for this year",
                "detail": " / ".join(
                    f"{s['display']} at {_g(s['weight_g'])}g" for s in specs
                ) + ". Weight is how you tell them apart.",
            }
        )

    for s in specs:
        if s.get("note"):
            result["findings"].append(
                {"level": "info", "title": s["display"], "detail": s["note"]}
            )

    # --- weight ----------------------------------------------------------
    if weight_g is None:
        result["verdict"] = "unweighed"
        result["findings"].append(
            {
                "level": "info",
                "title": "Not weighed yet",
                "detail": "A 0.01g scale is the single highest-value tool you can add. "
                          "It is the only check here that can identify an error on its own.",
            }
        )
    else:
        matched = [s for s in specs if _in_tolerance(weight_g, s)]
        if matched:
            s = matched[0]
            result["verdict"] = "in_spec"
            result["findings"].append(
                {
                    "level": "ok",
                    "title": f"Weight in spec - {s['display']}",
                    "detail": f"Measured {weight_g:.2f}g against a target of "
                              f"{_g(s['weight_g'])}g (tolerance +/-{_g(s['tolerance_g'])}g). "
                              f"Composition: {s['composition']}.",
                }
            )
        else:
            result["verdict"] = "off_spec"
            nearest = min(specs, key=lambda s: abs(weight_g - s["weight_g"]))
            deviation = weight_g - nearest["weight_g"]
            result["findings"].append(
                {
                    "level": "alert",
                    "title": "OFF SPEC WEIGHT",
                    "detail": f"Measured {weight_g:.2f}g but {nearest['display']} should "
                              f"weigh {_g(nearest['weight_g'])}g +/-{_g(nearest['tolerance_g'])}g. "
                              f"That is {deviation:+.2f}g "
                              f"({deviation / nearest['weight_g'] * 100:+.1f}%).",
                }
            )

            exclude = {s["id"] for s in specs}
            candidates = _planchet_candidates(
                weight_g, year, nearest["diameter_mm"], exclude
            )
            # A real match makes the near-misses noise. Only fall back to the
            # implausible ones (capped) when nothing plausible turned up, and
            # hold them back so they never sit above an actual alert.
            plausible = [c for c in candidates if c["plausible"]]
            deferred = [] if plausible else candidates[:2]

            def describe(cand):
                s = cand["spec"]
                reasons = []
                if not cand["fits_collar"]:
                    reasons.append(
                        f"a {_mm(s['diameter_mm'])}mm planchet will not fit a "
                        f"{_mm(nearest['diameter_mm'])}mm collar"
                    )
                if not cand["era_plausible"]:
                    reasons.append(f"that planchet was not in production near {year}")
                detail = (
                    f"{weight_g:.2f}g matches the {s['display']} planchet "
                    f"({_g(s['weight_g'])}g, {s['composition']})."
                )
                if reasons:
                    detail += " Unlikely though: " + "; ".join(reasons) + "."
                    return {
                        "level": "info",
                        "title": f"Weight matches (but implausible): {s['display']}",
                        "detail": detail,
                    }
                detail += (
                    " This is exactly what a struck-on-wrong-planchet error looks "
                    "like. Check the diameter and edge, then get it authenticated."
                )
                return {
                    "level": "alert",
                    "title": f"WRONG PLANCHET CANDIDATE: {s['display']}",
                    "detail": detail,
                }

            result["findings"].extend(describe(c) for c in plausible)

            # Missing clad layer - a specific, common, and collectible shortfall.
            if "clad" in nearest["composition"].lower() and deviation < 0:
                expected = nearest["weight_g"] * (1 - CLAD_LAYER_FRACTION)
                if abs(weight_g - expected) < nearest["weight_g"] * 0.05:
                    result["findings"].append(
                        {
                            "level": "alert",
                            "title": "MISSING CLAD LAYER CANDIDATE",
                            "detail": f"A {nearest['display']} missing one clad layer "
                                      f"weighs roughly {expected:.2f}g, and this one is "
                                      f"{weight_g:.2f}g. Look for one side that is solid "
                                      f"copper-colored while the other looks normal.",
                        }
                    )

            if deviation < -nearest["tolerance_g"]:
                result["findings"].append(
                    {
                        "level": "warn",
                        "title": "Underweight - other causes to rule out",
                        "detail": "Clipped or incomplete planchet (look for a curved bite "
                                  "with a weak rim opposite it), a split or laminated "
                                  "planchet, heavy wear, or corrosion.",
                    }
                )
            elif deviation > nearest["tolerance_g"]:
                result["findings"].append(
                    {
                        "level": "warn",
                        "title": "Overweight - other causes to rule out",
                        "detail": "Aftermarket plating, encrusted dirt or corrosion, glue "
                                  "or solder residue, a thick planchet, or a double strike. "
                                  "Clean it gently with nothing more than distilled water "
                                  "and reweigh -- never polish or scrub a coin.",
                    }
                )

            # Long-shot weight coincidences go last, below anything actionable.
            result["findings"].extend(describe(c) for c in deferred)

    # --- diameter --------------------------------------------------------
    if diameter_mm is not None:
        target = specs[0]["diameter_mm"]
        delta = diameter_mm - target
        if delta > 0.4:
            result["findings"].append(
                {
                    "level": "alert",
                    "title": "OVERSIZED - broadstrike candidate",
                    "detail": f"Measured {diameter_mm:.2f}mm against a target of {_mm(target)}mm. "
                              f"A coin struck without its collar spreads wider and has a "
                              f"thin flat rim with no reeding. Check the edge.",
                }
            )
        elif delta < -0.4:
            result["findings"].append(
                {
                    "level": "warn",
                    "title": "Undersized",
                    "detail": f"Measured {diameter_mm:.2f}mm against a target of {_mm(target)}mm. "
                              f"Could be a wrong planchet, a clip, or heavy rim wear.",
                }
            )
        else:
            result["findings"].append(
                {
                    "level": "ok",
                    "title": "Diameter in spec",
                    "detail": f"Measured {diameter_mm:.2f}mm against a target of {_mm(target)}mm.",
                }
            )

    # --- magnetism -------------------------------------------------------
    if is_magnetic is not None:
        should_be = any(
            "steel" in s["composition"].lower() for s in specs
        )
        if is_magnetic and not should_be:
            result["findings"].append(
                {
                    "level": "alert",
                    "title": "UNEXPECTEDLY MAGNETIC",
                    "detail": "This coin should not be magnetic. That points to a steel "
                              "planchet - either an off-metal error or a foreign coin "
                              "struck with US dies. Weigh it and check the diameter.",
                }
            )
        elif not is_magnetic and should_be:
            result["findings"].append(
                {
                    "level": "alert",
                    "title": "NOT MAGNETIC BUT SHOULD BE",
                    "detail": "A 1943 cent that is not magnetic and weighs about 3.11g is a "
                              "candidate for the famous 1943 copper cent. Most are "
                              "copper-plated steel fakes, so confirm with the scale, then "
                              "send it to PCGS or NGC. Do not clean it.",
                }
            )
        else:
            result["findings"].append(
                {
                    "level": "ok",
                    "title": "Magnetism as expected",
                    "detail": "Magnetic." if is_magnetic else "Non-magnetic, as expected.",
                }
            )

    return result
