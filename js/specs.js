// Mint-spec lookup and measurement analysis.
//
// A direct port of app/specs.py. The wording of every finding is kept
// identical so the two versions can be cross-checked against each other.

export const CLAD_LAYER_FRACTION = 0.165;
export const PLANCHET_CARRYOVER_YEARS = 5;

let SERIES = [];

export function initSpecs(json) {
  SERIES = json.series;
}

export function allSeries() {
  return SERIES;
}

export function denominations() {
  const seen = [];
  for (const s of SERIES) {
    if (!seen.includes(s.denomination)) seen.push(s.denomination);
  }
  return seen;
}

export function findSpecs(denomination, year, isProof = false) {
  if (!denomination || !year) return [];
  let matches = SERIES.filter(
    (s) =>
      s.denomination === denomination &&
      s.year_start <= year &&
      year <= s.year_end
  );
  if (!isProof) matches = matches.filter((s) => !s.proof_only);
  return matches;
}

function inTolerance(weight, spec) {
  return Math.abs(weight - spec.weight_g) <= spec.tolerance_g;
}

// Signed number formatting that matches Python's f"{n:+.2f}".
function signed(n, places = 2) {
  return (n >= 0 ? "+" : "") + n.toFixed(places);
}

// Trim trailing zeros but keep a minimum precision. JSON has no way to say
// "5.00", so a whole-number weight arrives as 5 and would print as a bare "5g"
// among figures that all carry decimals.
function fmt(value, minPlaces) {
  const text = value.toFixed(3).replace(/0+$/, "");
  const [whole, frac = ""] = text.split(".");
  return whole + "." + frac.padEnd(minPlaces, "0");
}

const g = (v) => fmt(v, 2);
const mm = (v) => fmt(v, 1);

function planchetCandidates(weight, coinYear, targetDiameter, excludeIds) {
  const out = [];
  for (const s of SERIES) {
    if (excludeIds.has(s.id)) continue;
    if (!inTolerance(weight, s)) continue;

    // A planchet larger than the collar physically cannot be struck in it.
    const fits = targetDiameter == null || s.diameter_mm <= targetDiameter + 0.5;
    const eraOk =
      coinYear == null ||
      (s.year_start <= coinYear &&
        coinYear <= s.year_end + PLANCHET_CARRYOVER_YEARS);

    out.push({
      spec: s,
      fits_collar: fits,
      era_plausible: eraOk,
      plausible: fits && eraOk,
    });
  }
  // Most plausible first, then closest by weight.
  out.sort((a, b) => {
    if (a.plausible !== b.plausible) return a.plausible ? -1 : 1;
    return (
      Math.abs(weight - a.spec.weight_g) - Math.abs(weight - b.spec.weight_g)
    );
  });
  return out;
}

export function analyze({
  denomination,
  year,
  weightG = null,
  diameterMm = null,
  isMagnetic = null,
  isProof = false,
}) {
  const result = {
    specs: findSpecs(denomination, year, isProof),
    findings: [],
    verdict: "no_data",
  };
  const specs = result.specs;

  if (!specs.length) {
    result.findings.push({
      level: "info",
      title: "No spec on file",
      detail:
        "This tool only carries US mint specs so far. Record the weight and " +
        "diameter anyway -- the data is still useful, and specs for other " +
        "countries can be added later.",
    });
    return result;
  }

  if (specs.length > 1) {
    result.findings.push({
      level: "info",
      title: `${specs.length} legitimate compositions for this year`,
      detail:
        specs.map((s) => `${s.display} at ${g(s.weight_g)}g`).join(" / ") +
        ". Weight is how you tell them apart.",
    });
  }

  for (const s of specs) {
    if (s.note) {
      result.findings.push({ level: "info", title: s.display, detail: s.note });
    }
  }

  // --- weight ------------------------------------------------------------
  if (weightG == null) {
    result.verdict = "unweighed";
    result.findings.push({
      level: "info",
      title: "Not weighed yet",
      detail:
        "A 0.01g scale is the single highest-value tool you can add. It is " +
        "the only check here that can identify an error on its own.",
    });
  } else {
    const matched = specs.filter((s) => inTolerance(weightG, s));
    if (matched.length) {
      const s = matched[0];
      result.verdict = "in_spec";
      result.findings.push({
        level: "ok",
        title: `Weight in spec - ${s.display}`,
        detail:
          `Measured ${weightG.toFixed(2)}g against a target of ${g(s.weight_g)}g ` +
          `(tolerance +/-${g(s.tolerance_g)}g). Composition: ${s.composition}.`,
      });
    } else {
      result.verdict = "off_spec";
      const nearest = specs.reduce((a, b) =>
        Math.abs(weightG - a.weight_g) <= Math.abs(weightG - b.weight_g) ? a : b
      );
      const deviation = weightG - nearest.weight_g;
      result.findings.push({
        level: "alert",
        title: "OFF SPEC WEIGHT",
        detail:
          `Measured ${weightG.toFixed(2)}g but ${nearest.display} should weigh ` +
          `${g(nearest.weight_g)}g +/-${g(nearest.tolerance_g)}g. That is ` +
          `${signed(deviation)}g (${signed(
            (deviation / nearest.weight_g) * 100,
            1
          )}%).`,
      });

      const exclude = new Set(specs.map((s) => s.id));
      const candidates = planchetCandidates(
        weightG,
        year,
        nearest.diameter_mm,
        exclude
      );
      // A real match makes the near-misses noise. Only fall back to the
      // implausible ones (capped) when nothing plausible turned up, and hold
      // them back so they never sit above an actual alert.
      const plausible = candidates.filter((c) => c.plausible);
      const deferred = plausible.length ? [] : candidates.slice(0, 2);

      const describe = (cand) => {
        const s = cand.spec;
        const reasons = [];
        if (!cand.fits_collar) {
          reasons.push(
            `a ${mm(s.diameter_mm)}mm planchet will not fit a ` +
              `${mm(nearest.diameter_mm)}mm collar`
          );
        }
        if (!cand.era_plausible) {
          reasons.push(`that planchet was not in production near ${year}`);
        }
        let detail =
          `${weightG.toFixed(2)}g matches the ${s.display} planchet ` +
          `(${g(s.weight_g)}g, ${s.composition}).`;
        if (reasons.length) {
          detail += " Unlikely though: " + reasons.join("; ") + ".";
          return {
            level: "info",
            title: `Weight matches (but implausible): ${s.display}`,
            detail,
          };
        }
        detail +=
          " This is exactly what a struck-on-wrong-planchet error looks like. " +
          "Check the diameter and edge, then get it authenticated.";
        return {
          level: "alert",
          title: `WRONG PLANCHET CANDIDATE: ${s.display}`,
          detail,
        };
      };

      result.findings.push(...plausible.map(describe));

      // Missing clad layer - a specific, common, and collectible shortfall.
      if (nearest.composition.toLowerCase().includes("clad") && deviation < 0) {
        const expected = nearest.weight_g * (1 - CLAD_LAYER_FRACTION);
        if (Math.abs(weightG - expected) < nearest.weight_g * 0.05) {
          result.findings.push({
            level: "alert",
            title: "MISSING CLAD LAYER CANDIDATE",
            detail:
              `A ${nearest.display} missing one clad layer weighs roughly ` +
              `${expected.toFixed(2)}g, and this one is ${weightG.toFixed(2)}g. ` +
              `Look for one side that is solid copper-colored while the other ` +
              `looks normal.`,
          });
        }
      }

      if (deviation < -nearest.tolerance_g) {
        result.findings.push({
          level: "warn",
          title: "Underweight - other causes to rule out",
          detail:
            "Clipped or incomplete planchet (look for a curved bite with a " +
            "weak rim opposite it), a split or laminated planchet, heavy wear, " +
            "or corrosion.",
        });
      } else if (deviation > nearest.tolerance_g) {
        result.findings.push({
          level: "warn",
          title: "Overweight - other causes to rule out",
          detail:
            "Aftermarket plating, encrusted dirt or corrosion, glue or solder " +
            "residue, a thick planchet, or a double strike. Clean it gently " +
            "with nothing more than distilled water and reweigh -- never " +
            "polish or scrub a coin.",
        });
      }

      // Long-shot weight coincidences go last, below anything actionable.
      result.findings.push(...deferred.map(describe));
    }
  }

  // --- diameter ----------------------------------------------------------
  if (diameterMm != null) {
    const target = specs[0].diameter_mm;
    const delta = diameterMm - target;
    if (delta > 0.4) {
      result.findings.push({
        level: "alert",
        title: "OVERSIZED - broadstrike candidate",
        detail:
          `Measured ${diameterMm.toFixed(2)}mm against a target of ${mm(target)}mm. ` +
          `A coin struck without its collar spreads wider and has a thin flat ` +
          `rim with no reeding. Check the edge.`,
      });
    } else if (delta < -0.4) {
      result.findings.push({
        level: "warn",
        title: "Undersized",
        detail:
          `Measured ${diameterMm.toFixed(2)}mm against a target of ${mm(target)}mm. ` +
          `Could be a wrong planchet, a clip, or heavy rim wear.`,
      });
    } else {
      result.findings.push({
        level: "ok",
        title: "Diameter in spec",
        detail: `Measured ${diameterMm.toFixed(
          2
        )}mm against a target of ${mm(target)}mm.`,
      });
    }
  }

  // --- magnetism ---------------------------------------------------------
  if (isMagnetic != null) {
    const shouldBe = specs.some((s) =>
      s.composition.toLowerCase().includes("steel")
    );
    if (isMagnetic && !shouldBe) {
      result.findings.push({
        level: "alert",
        title: "UNEXPECTEDLY MAGNETIC",
        detail:
          "This coin should not be magnetic. That points to a steel planchet " +
          "- either an off-metal error or a foreign coin struck with US dies. " +
          "Weigh it and check the diameter.",
      });
    } else if (!isMagnetic && shouldBe) {
      result.findings.push({
        level: "alert",
        title: "NOT MAGNETIC BUT SHOULD BE",
        detail:
          "A 1943 cent that is not magnetic and weighs about 3.11g is a " +
          "candidate for the famous 1943 copper cent. Most are copper-plated " +
          "steel fakes, so confirm with the scale, then send it to PCGS or " +
          "NGC. Do not clean it.",
      });
    } else {
      result.findings.push({
        level: "ok",
        title: "Magnetism as expected",
        detail: isMagnetic ? "Magnetic." : "Non-magnetic, as expected.",
      });
    }
  }

  return result;
}
