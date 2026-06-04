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
 * QUANTITATIVE  → all metric fields must be filled → full weightInSdg contribution; partial → 0
 *
 * Special-case scoring (override of standard formulas):
 *   13.4.1 (Carbon-neutral commitment) — max 5pt:
 *     gate: answered === "ya" (else 0)
 *     p_evidence (0/0.5/1 from word count) + p_public (0/1) + p_scope (0..3 from scopeCoverage)
 *   13.4.2 (Achieve-by date) — max 4pt:
 *     pure year tier on targetYear:
 *       <=2023 → 4, 2024-2029 → 3, 2030-2039 → 2, 2040-2049 → 1, >=2050 → 0.5, else 0
 */

import { THE_SDG_CONFIG_2026, type SdgIndicator, type QualAnswer, type QuantAnswer, type BiblAnswer, type SdgAnswers } from "./the-sdg-config";

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
  filled: boolean;
  weightInSdg: number;
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
      const ans = answers[ind.code] as QuantAnswer | undefined;
      const allFilled = !!ans && !!ind.metrics && ind.metrics.every((m) => !!ans[m.key]);
      if (allFilled) weightedScore += ind.weightInSdg;
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
      const ans = answers[ind.code] as QuantAnswer | undefined;
      const filled = !!ans && !!ind.metrics && ind.metrics.every((m) => !!ans[m.key]);
      const contribution = filled ? ind.weightInSdg : 0;
      byIndicator.push({ indicatorCode: ind.code, type: "QUANTITATIVE", filled, weightInSdg: ind.weightInSdg, contribution });
      groupWeight[groupKey] = (groupWeight[groupKey] ?? 0) + ind.weightInSdg;
      groupScore[groupKey] = (groupScore[groupKey] ?? 0) + contribution;
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
