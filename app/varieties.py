"""Known-variety lookup and the generic inspection checklist."""

import json
from pathlib import Path

DATA = Path(__file__).parent / "data"


def _load(name):
    with open(DATA / name, encoding="utf-8") as fh:
        return json.load(fh)


_VARIETIES = _load("varieties.json")["varieties"]
_ERRORS = _load("error_types.json")

SEVERITY_ORDER = {"legendary": 0, "major": 1, "moderate": 2, "minor": 3}


def all_varieties():
    return sorted(_VARIETIES, key=lambda v: (v["denomination"], v.get("years") or [0]))


def get_variety(variety_id):
    return next((v for v in _VARIETIES if v["id"] == variety_id), None)


def for_coin(denomination, year, mint_mark=""):
    """Varieties worth checking on a specific coin.

    A variety matches on an explicit ``years`` list, or on a ``year_range`` for
    ones that span a whole series -- BIE die breaks and Presidential edge
    lettering are not tied to a single date, but they are still bounded.
    """
    mint_mark = (mint_mark or "").strip().upper()
    hits = []
    for v in _VARIETIES:
        if v["denomination"] != denomination:
            continue
        if v["years"]:
            if year not in v["years"]:
                continue
        elif v.get("year_range"):
            start, end = v["year_range"]
            if year is None or not (start <= year <= end):
                continue
        if v["mint_marks"] and mint_mark not in [m.upper() for m in v["mint_marks"]]:
            continue
        hits.append(v)
    return sorted(hits, key=lambda v: SEVERITY_ORDER.get(v["severity"], 9))


def zones():
    return _ERRORS["zones"]


def all_check_keys():
    return [c["key"] for z in _ERRORS["zones"] for c in z["checks"]]


def critical_lesson():
    return _ERRORS["critical_lesson"]


def damage_not_error():
    return _ERRORS["damage_not_error"]


def search(term):
    """Free-text search across varieties, for the reference page."""
    term = (term or "").strip().lower()
    if not term:
        return []
    out = []
    for v in _VARIETIES:
        blob = " ".join(
            str(v.get(k, "")) for k in ("name", "type", "look_for", "where", "beware")
        ).lower()
        if term in blob or term in v["denomination"]:
            out.append(v)
    return sorted(out, key=lambda v: SEVERITY_ORDER.get(v["severity"], 9))
