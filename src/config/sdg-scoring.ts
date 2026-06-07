/**
 * SDG Scoring Engine — THE Impact Rankings 2026 methodology
 *
 * Formula per QUALITATIVE indicator:
 *   p1 = answered === "ya" ? 1 : 0
 *   p2 = p1 === 0 ? 0 : wordCount >= 50 ? 1 : wordCount >= 20 ? 0.5 : wordCount > 0 ? 0.25 : 0
 *   p3 = publicLinks.length > 0 ? 1 : 0
 *   score = p1 + p2 + p3
 *   contribution = (score / maxScore) * weightInSdg
 *
 * BIBLIOMETRIC  → validator fills a percentage score (0–100); contribution = (score/100) * weightInSdg
 * QUANTITATIVE  → compute the PDF-exact raw RATIO only (see QUANT_FORMULAS, 6 patterns A–F).
 *                 Normalisation 0–100 is THE central's job (needs the cross-university cohort),
 *                 so it is NOT done here → quantitative contributes 0 to the SDG total. The ratio
 *                 is surfaced for display + year-over-year self-comparison. A missing/blank field
 *                 marks only THAT indicator not_assessed (PDF: "zero for that metric"), it does
 *                 NOT zero the whole SDG. Gated metrics (2.2.2/6.2.2/12.3.2/13.2.2) need their
 *                 tracking indicator answered "ya" or the ratio is null.
 *
 * Special-case scoring (override of standard formulas):
 *   13.4.1 (Carbon-neutral commitment) — max 5pt:
 *     gate: answered === "ya" (else 0)
 *     p_evidence (0/0.5/1 from word count) + p_public (0/1) + p_scope (0..3 from scopeCoverage)
 *   13.4.2 (Achieve-by date) — max 4pt:
 *     pure year tier on targetYear:
 *       <=2023 → 4, 2024-2029 → 3, 2030-2039 → 2, 2040-2049 → 1, >=2050 → 0.5, else 0
 */

import { THE_SDG_CONFIG_2026, QUANT_FORMULAS, type SdgIndicator, type QualAnswer, type QuantAnswer, type BiblAnswer, type SdgAnswers } from "./the-sdg-config";

export type { QualAnswer, QuantAnswer, BiblAnswer, SdgAnswers };

export interface QualIndicatorScore {
  indicatorCode: string;
  type: "QUALITATIVE";
  score: number;
  maxScore: number;
  pct: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  wordCount: number;
  weightInSdg: number;
  contribution: number;
}

export interface QuantIndicatorScore {
  indicatorCode: string;
  type: "QUANTITATIVE";
  /** All formula fields present & ratio computable. Kept for completeness/readiness checks. */
  filled: boolean;
  /** PDF-exact raw ratio (A/B/D/E), per-employee value (C), or count (F). null if gated/missing/no recipe. */
  rawValue: number | null;
  /** rawValue as % — only for proportion patterns A/D/E (0–1 → 0–100). null for B/C/F or unavailable. */
  ratioPct: number | null;
  /** computed = ratio ready; gated = tracking indicator not "ya"; not_assessed = missing field / no recipe. */
  state: "computed" | "gated" | "not_assessed";
  /** higher = bigger ratio is better; lower = smaller is better (B per-capita metrics). */
  direction: "higher" | "lower";
  gated: boolean;
  /** C only: regional-GDP normalisation not applied (data not collected) → base ratio only. */
  partialExternal?: boolean;
  weightInSdg: number;
  /** Always 0 — quantitative does not contribute to the SDG total (normalisation is THE's job). */
  contribution: number;
}

export interface BiblIndicatorScore {
  indicatorCode: string;
  type: "BIBLIOMETRIC";
  score: number | undefined;
  weightInSdg: number;
  contribution: number;
}

export type IndicatorScore = QualIndicatorScore | QuantIndicatorScore | BiblIndicatorScore;

export interface SdgScoreBreakdown {
  total: number;
  byIndicator: IndicatorScore[];
  byGroupScore: Record<string, number>;
  byGroupWeight: Record<string, number>;
}

function countWords(text: string): number {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

const SCOPE_TIER_POINTS: Record<NonNullable<QualAnswer["scopeCoverage"]>, number> = {
  none: 0,
  scope1_2: 1,
  scope1_2_3_partial: 2,
  scope1_2_3_full: 3,
};

/**
 * Existence point (p1) per indicator config.
 *  binary (or unset) → answered==="ya" ? 1 : 0
 *  select → must answer "ya", then value of chosen option id
 *  multi  → must answer "ya", then sum of chosen option values, capped.
 *           ALL options selected → exactly `cap` (THE wording "maximum one
 *           point for all"; component figures like 0.33 are rounded thirds,
 *           so 0.33×3 must resolve to 1, not 0.99).
 */
function calcExistenceP1(ind: SdgIndicator, ans: QualAnswer): number {
  const es = ind.existenceScoring;
  if (!es || es.mode === "binary") return ans.answered === "ya" ? 1 : 0;
  if (ans.answered !== "ya") return 0;
  if (es.mode === "select") {
    const opt = es.options.find((o) => o.id === ans.existenceChoice);
    return opt ? opt.value : 0;
  }
  const chosen = new Set(ans.existenceChoices ?? []);
  const picked = es.options.filter((o) => chosen.has(o.id));
  if (picked.length === es.options.length) return es.cap;
  const sum = picked.reduce((s, o) => s + o.value, 0);
  return Math.min(es.cap, parseFloat(sum.toFixed(2)));
}

function calcCarbonTargetYearScore(year: number | null | undefined): number {
  if (!year || year <= 0) return 0;
  if (year <= 2023) return 4;
  if (year <= 2029) return 3;
  if (year <= 2039) return 2;
  if (year <= 2049) return 1;
  return 0.5;
}

// ─── QUANTITATIVE raw-value (ratio) computation — 6 patterns + gate ───
export interface QuantRawResult {
  /** ratio (A/B/D/E), per-employee value (C base), or count (F); null if gated/missing/no recipe. */
  value: number | null;
  state: "computed" | "gated" | "not_assessed";
  direction: "higher" | "lower";
  gated: boolean;
  /** true when one or more required formula fields are missing/blank. */
  missingFields: boolean;
  /** C only: regional-GDP normalisation not applied (data unavailable). */
  partialExternal?: boolean;
}

/** Read a numeric metric value (stored as string) from an indicator's answer. null if blank/invalid. */
function numField(answers: SdgAnswers, code: string, key: string): number | null {
  const a = answers[code] as QuantAnswer | undefined;
  const raw = a?.[key];
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Compute the PDF-exact raw ratio for a QUANTITATIVE indicator.
 * Ratio only — NO 0–100 normalisation (that is THE central's job, needs the cohort).
 */
export function computeQuantRaw(ind: SdgIndicator, answers: SdgAnswers): QuantRawResult {
  const f = QUANT_FORMULAS[ind.code];
  const direction = f?.direction ?? "higher";

  // No recipe (e.g. 4.3.6/4.3.7 year-capture helpers) → not scored as a ratio.
  if (!f) return { value: null, state: "not_assessed", direction, gated: false, missingFields: true };

  // Gate (PDF-strict): the linked tracking indicator must report WHOLE-university
  // measurement — answered "ya" AND existenceChoice "whole". Partial/none → gated.
  // (PDF: "only scored where measuring across the whole university".)
  if (f.gate) {
    const g = answers[f.gate] as QualAnswer | undefined;
    if (!g || g.answered !== "ya" || g.existenceChoice !== "whole") {
      return { value: null, state: "gated", direction, gated: true, missingFields: false };
    }
  }

  // F — absolute count (no division).
  if (f.pattern === "F") {
    const v = numField(answers, ind.code, f.countKey ?? "");
    if (v === null) return { value: null, state: "not_assessed", direction, gated: false, missingFields: true };
    return { value: v, state: "computed", direction, gated: false, missingFields: false };
  }

  // E — subject-weighted: pooled sum(numerator)/sum(denominator) across subjects.
  if (f.pattern === "E") {
    let sumNum = 0, sumDen = 0, anyMissing = false;
    for (const s of f.subjects ?? []) {
      const n = numField(answers, ind.code, s.numerator);
      const d = numField(answers, ind.code, s.denominator);
      if (n === null || d === null) { anyMissing = true; continue; }
      sumNum += n; sumDen += d;
    }
    if (sumDen <= 0) return { value: null, state: "not_assessed", direction, gated: false, missingFields: true };
    return { value: sumNum / sumDen, state: "computed", direction, gated: false, missingFields: anyMissing };
  }

  // A, B, C, D — numerator / denominator.
  const num = numField(answers, ind.code, f.numerator ?? "");
  const den = numField(answers, ind.code, f.denominator ?? "");
  if (num === null || den === null || den === 0) {
    return { value: null, state: "not_assessed", direction, gated: false, missingFields: true };
  }
  // C (8.3): (expenditure/employees) / regional GDP per capita. GDP is not collected by this
  // internal system, so only the base ratio (expenditure per employee) is produced.
  const partialExternal = f.pattern === "C" ? true : undefined;
  return { value: num / den, state: "computed", direction, gated: false, missingFields: false, partialExternal };
}

/** Build the display-facing quantitative score row (contributes 0 to the SDG total). */
export function buildQuantScore(ind: SdgIndicator, answers: SdgAnswers): QuantIndicatorScore {
  const raw = computeQuantRaw(ind, answers);
  const f = QUANT_FORMULAS[ind.code];
  const isProportion = !!f && (f.pattern === "A" || f.pattern === "D" || f.pattern === "E");
  const ratioPct = isProportion && raw.value !== null ? parseFloat((raw.value * 100).toFixed(2)) : null;
  return {
    indicatorCode: ind.code,
    type: "QUANTITATIVE",
    filled: raw.state === "computed",
    rawValue: raw.value,
    ratioPct,
    state: raw.state,
    direction: raw.direction,
    gated: raw.gated,
    partialExternal: raw.partialExternal,
    weightInSdg: ind.weightInSdg,
    contribution: 0,
  };
}

// ─── Year-over-year self-comparison for a QUANTITATIVE indicator ───
// Compares the institution's OWN ratio this year vs a prior year. No normalisation
// needed (self-comparison). Per-indicator: a blank prior → baseline. `direction`
// decides whether a delta is an improvement (B per-capita: smaller is better).
export interface QuantTrend {
  indicatorCode: string;
  /** not_assessed = no current ratio; baseline = no comparable prior; trend = both present. */
  state: "not_assessed" | "baseline" | "trend";
  current: number | null;
  prior: number | null;
  delta: number | null;
  /** delta interpreted via direction: true = improved, false = worsened, null = flat/none. */
  improved: boolean | null;
  direction: "higher" | "lower";
  /** Year the prior value came from (for a "vs 20XX" label). */
  priorYear?: number;
}

/**
 * Compare a quantitative indicator's current ratio against a prior submission.
 * `prior` should be the latest earlier submission's answers (+ its year); pass null if none.
 */
export function compareQuantYear(
  ind: SdgIndicator,
  currentAnswers: SdgAnswers,
  prior: { year: number; answers: SdgAnswers } | null,
): QuantTrend {
  const cur = computeQuantRaw(ind, currentAnswers);
  const direction = cur.direction;
  if (cur.value === null) {
    return { indicatorCode: ind.code, state: "not_assessed", current: null, prior: null, delta: null, improved: null, direction };
  }
  if (!prior) {
    return { indicatorCode: ind.code, state: "baseline", current: cur.value, prior: null, delta: null, improved: null, direction };
  }
  const pr = computeQuantRaw(ind, prior.answers);
  if (pr.value === null) {
    return { indicatorCode: ind.code, state: "baseline", current: cur.value, prior: null, delta: null, improved: null, direction, priorYear: prior.year };
  }
  const delta = parseFloat((cur.value - pr.value).toFixed(6));
  const improved = delta === 0 ? null : direction === "higher" ? delta > 0 : delta < 0;
  return { indicatorCode: ind.code, state: "trend", current: cur.value, prior: pr.value, delta, improved, direction, priorYear: prior.year };
}

/**
 * Pick the comparator prior for an indicator: walk earlier years and return the FIRST
 * (most recent) one where THIS indicator's ratio is computable. Skips years where the
 * indicator is blank/gated. Returns null if no earlier year has data → caller treats
 * the current year as the indicator's baseline (first data entry).
 * `priors` MUST be sorted by year DESCENDING (most recent first).
 */
export function resolveQuantPrior(
  ind: SdgIndicator,
  priors: { year: number; answers: SdgAnswers }[],
): { year: number; answers: SdgAnswers } | null {
  for (const p of priors) {
    if (computeQuantRaw(ind, p.answers).value !== null) return p;
  }
  return null;
}

export function calcQualScore(ind: SdgIndicator, ans: QualAnswer | undefined): {
  score: number; max: number; pct: number; p1: number; p2: number; p3: number; p4: number; wc: number;
} {
  const max = ind.maxScore ?? 3;
  if (ind.type !== "QUALITATIVE") {
    return { score: 0, max, pct: 0, p1: 0, p2: 0, p3: 0, p4: 0, wc: 0 };
  }

  if (ind.code === "13.4.2") {
    const score = calcCarbonTargetYearScore(ans?.targetYear);
    return { score, max, pct: max > 0 ? Math.round((score / max) * 100) : 0, p1: 0, p2: 0, p3: 0, p4: score, wc: 0 };
  }

  if (!ans) {
    return { score: 0, max, pct: 0, p1: 0, p2: 0, p3: 0, p4: 0, wc: 0 };
  }

  if (ind.code === "13.4.1") {
    if (ans.answered !== "ya") {
      return { score: 0, max, pct: 0, p1: 0, p2: 0, p3: 0, p4: 0, wc: 0 };
    }
    const wc = countWords(ans.comment ?? "");
    const p_evidence = wc >= 50 ? 1 : wc > 0 ? 0.5 : 0;
    const links = (ans.publicLinks ?? []).filter((l) => (l ?? "").trim());
    const p_public = links.length > 0 ? 1 : 0;
    const p_scope = SCOPE_TIER_POINTS[ans.scopeCoverage ?? "none"] ?? 0;
    const score = parseFloat((p_evidence + p_public + p_scope).toFixed(2));
    return { score, max, pct: max > 0 ? Math.round((score / max) * 100) : 0, p1: 1, p2: p_evidence, p3: p_public, p4: p_scope, wc };
  }

  const p1 = calcExistenceP1(ind, ans);
  const wc = countWords(ans.comment ?? "");
  const p2 = p1 === 0 ? 0 : wc >= 50 ? 1 : wc > 0 ? 0.5 : 0;
  const links = (ans.publicLinks ?? []).filter((l) => (l ?? "").trim());
  const p3 = links.length > 0 ? 1 : 0;
  const p4 = max >= 4 ? (ans.policyUpdated ? 1 : 0) : 0;

  const score = parseFloat((p1 + p2 + p3 + p4).toFixed(2));
  return { score, max, pct: Math.round((score / max) * 100), p1, p2, p3, p4, wc };
}

export function calcSdgEstimate(sdgNum: number, answers: SdgAnswers): number {
  const cfg = THE_SDG_CONFIG_2026[sdgNum];
  if (!cfg) return 0;

  let weightedScore = 0;

  for (const ind of cfg.indicators) {
    if (ind.type === "BIBLIOMETRIC") {
      const ans = answers[ind.code] as BiblAnswer | undefined;
      if (ans?.score !== undefined && ans.score > 0) {
        const pct = Math.min(100, Math.max(0, ans.score)) / 100;
        weightedScore += pct * ind.weightInSdg;
      }
      continue;
    }

    if (ind.type === "QUANTITATIVE") {
      // Quantitative contributes 0 to the SDG total — normalisation is THE's job, so its
      // weight is excluded from the estimate entirely (not zeroed-into the denominator).
      continue;
    }

    const ans = answers[ind.code] as QualAnswer | undefined;
    const { score, max } = calcQualScore(ind, ans);
    const normed = max > 0 ? score / max : 0;
    weightedScore += normed * ind.weightInSdg;
  }

  return parseFloat(weightedScore.toFixed(2));
}

export function calcSdgBreakdown(sdgNum: number, answers: SdgAnswers): SdgScoreBreakdown {
  const cfg = THE_SDG_CONFIG_2026[sdgNum];
  if (!cfg) return { total: 0, byIndicator: [], byGroupScore: {}, byGroupWeight: {} };

  const byIndicator: IndicatorScore[] = [];
  const groupWeight: Record<string, number> = {};
  const groupScore: Record<string, number> = {};

  for (const ind of cfg.indicators) {
    const groupKey = ind.code.split(".").slice(0, 2).join(".");

    if (ind.type === "BIBLIOMETRIC") {
      const ans = answers[ind.code] as BiblAnswer | undefined;
      const score = ans?.score !== undefined ? Math.min(100, Math.max(0, ans.score)) : undefined;
      const contribution = score !== undefined ? parseFloat(((score / 100) * ind.weightInSdg).toFixed(2)) : 0;
      byIndicator.push({ indicatorCode: ind.code, type: "BIBLIOMETRIC", score, weightInSdg: ind.weightInSdg, contribution });
      groupWeight[groupKey] = (groupWeight[groupKey] ?? 0) + ind.weightInSdg;
      groupScore[groupKey] = (groupScore[groupKey] ?? 0) + contribution;
      continue;
    }

    if (ind.type === "QUANTITATIVE") {
      // Ratio only (PDF-exact); contributes 0. Excluded from group weight & SDG total so it
      // does NOT drag the score down (option: excluded, not zeroed). Surfaced for display + trend.
      byIndicator.push(buildQuantScore(ind, answers));
      continue;
    }

    const ans = answers[ind.code] as QualAnswer | undefined;
    const { score, max, pct, p1, p2, p3, p4, wc } = calcQualScore(ind, ans);
    const normed = max > 0 ? score / max : 0;
    const contribution = parseFloat((normed * ind.weightInSdg).toFixed(2));
    byIndicator.push({ indicatorCode: ind.code, type: "QUALITATIVE", score, maxScore: max, pct, p1, p2, p3, p4, wordCount: wc, weightInSdg: ind.weightInSdg, contribution });
    groupWeight[groupKey] = (groupWeight[groupKey] ?? 0) + ind.weightInSdg;
    groupScore[groupKey] = (groupScore[groupKey] ?? 0) + contribution;
  }

  const byGroupScore: Record<string, number> = {};
  const byGroupWeight: Record<string, number> = {};
  for (const [key, w] of Object.entries(groupWeight)) {
    byGroupWeight[key] = parseFloat(w.toFixed(2));
    byGroupScore[key] = w > 0 ? parseFloat(((groupScore[key] / w) * 100).toFixed(1)) : 0;
  }

  const total = parseFloat(
    byIndicator.reduce((sum, r) => sum + r.contribution, 0).toFixed(2)
  );

  return { total: Math.max(0, Math.min(total, 100)), byIndicator, byGroupScore, byGroupWeight };
}

export function isIndicatorAnswered(ind: SdgIndicator, ans: QualAnswer | QuantAnswer | BiblAnswer | undefined): boolean {
  if (ind.type === "BIBLIOMETRIC") return (ans as BiblAnswer | undefined)?.score !== undefined;
  if (ind.type === "QUANTITATIVE") return !!(ind.metrics?.some((m) => (ans as QuantAnswer | undefined)?.[m.key]));
  return (ans as QualAnswer | undefined)?.answered != null;
}
