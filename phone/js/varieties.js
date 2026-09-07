// Known-variety lookup and the inspection checklist.
// A direct port of app/varieties.py.

let VARIETIES = [];
let ERRORS = {};

export const SEVERITY_ORDER = {
  legendary: 0,
  major: 1,
  moderate: 2,
  minor: 3,
};

export function initVarieties(varietiesJson, errorsJson) {
  VARIETIES = varietiesJson.varieties;
  ERRORS = errorsJson;
}

function bySeverity(a, b) {
  return (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
}

export function allVarieties() {
  return [...VARIETIES].sort((a, b) => {
    if (a.denomination !== b.denomination) {
      return a.denomination < b.denomination ? -1 : 1;
    }
    return (a.years?.[0] ?? 0) - (b.years?.[0] ?? 0);
  });
}

export function getVariety(id) {
  return VARIETIES.find((v) => v.id === id) ?? null;
}

// A variety matches on an explicit `years` list, or on a `year_range` for ones
// that span a whole series (BIE die breaks, Presidential edge lettering).
export function forCoin(denomination, year, mintMark = "") {
  const mm = (mintMark || "").trim().toUpperCase();
  const hits = [];
  for (const v of VARIETIES) {
    if (v.denomination !== denomination) continue;
    if (v.years && v.years.length) {
      if (!v.years.includes(year)) continue;
    } else if (v.year_range) {
      const [start, end] = v.year_range;
      if (year == null || year < start || year > end) continue;
    }
    if (v.mint_marks && v.mint_marks.length) {
      if (!v.mint_marks.map((m) => m.toUpperCase()).includes(mm)) continue;
    }
    hits.push(v);
  }
  return hits.sort(bySeverity);
}

export function zones() {
  return ERRORS.zones;
}

export function allCheckKeys() {
  return ERRORS.zones.flatMap((z) => z.checks.map((c) => c.key));
}

export function criticalLesson() {
  return ERRORS.critical_lesson;
}

export function damageNotError() {
  return ERRORS.damage_not_error;
}

export function search(term) {
  term = (term || "").trim().toLowerCase();
  if (!term) return [];
  const out = VARIETIES.filter((v) => {
    const blob = ["name", "type", "look_for", "where", "beware"]
      .map((k) => String(v[k] ?? ""))
      .join(" ")
      .toLowerCase();
    return blob.includes(term) || v.denomination.includes(term);
  });
  return out.sort(bySeverity);
}
