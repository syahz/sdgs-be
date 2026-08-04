import type { SdgConfigPayload } from '../config/config-registry'
import type { SdgIndicator } from '../config/the-sdg-config'
import { canonicalJson, deepEqual } from '../utils/canonical-json'

/**
 * Bandingkan dua kerangka config untuk pratinjau sebelum aktivasi.
 *
 * Yang paling dicari operator: indikator apa yang hilang, apa yang baru, dan
 * bobot mana yang bergeser. Selisih bobot ditampilkan per SDG karena itu yang
 * langsung mengubah skor.
 */

export interface FieldChange {
  field: string
  before: unknown
  after: unknown
}

export interface IndicatorBrief {
  code: string
  label: string
  type: string
  weightInSdg: number
}

export interface ConfigDiff {
  sdgs: { added: number[]; removed: number[] }
  indicators: {
    added: IndicatorBrief[]
    removed: IndicatorBrief[]
    changed: { code: string; label: string; fields: FieldChange[] }[]
  }
  /** Pergeseran total bobot per SDG — paling sering jadi kejutan. */
  weights: { sdg: number; before: number; after: number; delta: number }[]
  questions: { added: string[]; removed: string[]; changed: string[] }
  formulas: { added: string[]; removed: string[]; changed: string[] }
  counts: {
    indicatorsBefore: number
    indicatorsAfter: number
    byTypeBefore: Record<string, number>
    byTypeAfter: Record<string, number>
  }
}

const brief = (i: SdgIndicator): IndicatorBrief => ({
  code: i.code,
  label: i.label,
  type: i.type,
  weightInSdg: i.weightInSdg,
})

function allIndicators(p: SdgConfigPayload): Map<string, SdgIndicator> {
  const m = new Map<string, SdgIndicator>()
  for (const s of Object.values(p.sdgs ?? {})) for (const i of s.indicators) m.set(i.code, i)
  return m
}

function byType(m: Map<string, SdgIndicator>): Record<string, number> {
  const out: Record<string, number> = { QUALITATIVE: 0, QUANTITATIVE: 0, BIBLIOMETRIC: 0 }
  for (const i of m.values()) out[i.type] = (out[i.type] ?? 0) + 1
  return out
}

function keyDiff(a: Record<string, unknown> = {}, b: Record<string, unknown> = {}) {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return {
    added: kb.filter((k) => !(k in a)),
    removed: ka.filter((k) => !(k in b)),
    changed: kb.filter((k) => k in a && !deepEqual(a[k], b[k])),
  }
}

/** `base` = config yang berlaku sekarang, `next` = yang diunggah. */
export function buildConfigDiff(base: SdgConfigPayload | null, next: SdgConfigPayload): ConfigDiff {
  const kosong: SdgConfigPayload = {
    schemaVersion: 1,
    year: next.year,
    sdgs: {},
    quantFormulas: {},
    qualQuestions: {},
    groupTitles: {},
  }
  const a = base ?? kosong

  const ia = allIndicators(a)
  const ib = allIndicators(next)

  const added: IndicatorBrief[] = []
  const removed: IndicatorBrief[] = []
  const changed: ConfigDiff['indicators']['changed'] = []

  for (const [code, ind] of ib) if (!ia.has(code)) added.push(brief(ind))
  for (const [code, ind] of ia) if (!ib.has(code)) removed.push(brief(ind))

  for (const [code, after] of ib) {
    const before = ia.get(code)
    if (!before) continue
    const fields: FieldChange[] = []
    // Bandingkan bentuk KANONIK: objek dari modul TS dan hasil round-trip JSON
    // punya urutan key berbeda, dan perbandingan mentah akan menandai ratusan
    // indikator "berubah" padahal isinya sama persis.
    const cek = (f: keyof SdgIndicator) => {
      if (!deepEqual(before[f] ?? null, after[f] ?? null)) {
        fields.push({ field: f as string, before: before[f] ?? null, after: after[f] ?? null })
      }
    }
    ;(['label', 'type', 'weightInSdg', 'maxScore', 'existenceScoring', 'metrics', 'subQuestions'] as const).forEach(cek)
    if (fields.length) changed.push({ code, label: after.label, fields })
  }

  const sdgA = new Set(Object.keys(a.sdgs ?? {}).map(Number))
  const sdgB = new Set(Object.keys(next.sdgs ?? {}).map(Number))

  const weights: ConfigDiff['weights'] = []
  for (const n of new Set([...sdgA, ...sdgB])) {
    const wa = (a.sdgs?.[n]?.indicators ?? []).reduce((s, i) => s + i.weightInSdg, 0)
    const wb = (next.sdgs?.[n]?.indicators ?? []).reduce((s, i) => s + i.weightInSdg, 0)
    const delta = parseFloat((wb - wa).toFixed(2))
    if (delta !== 0) weights.push({ sdg: n, before: parseFloat(wa.toFixed(2)), after: parseFloat(wb.toFixed(2)), delta })
  }
  weights.sort((x, y) => x.sdg - y.sdg)

  return {
    sdgs: {
      added: [...sdgB].filter((n) => !sdgA.has(n)).sort((x, y) => x - y),
      removed: [...sdgA].filter((n) => !sdgB.has(n)).sort((x, y) => x - y),
    },
    indicators: { added, removed, changed },
    weights,
    questions: keyDiff(a.qualQuestions, next.qualQuestions),
    formulas: keyDiff(
      a.quantFormulas as unknown as Record<string, unknown>,
      next.quantFormulas as unknown as Record<string, unknown>
    ),
    counts: {
      indicatorsBefore: ia.size,
      indicatorsAfter: ib.size,
      byTypeBefore: byType(ia),
      byTypeAfter: byType(ib),
    },
  }
}

/** Ringkas: apakah diff ini menyentuh hal yang mengubah skor? */
export function diffAffectsScoring(d: ConfigDiff): boolean {
  if (d.indicators.added.length || d.indicators.removed.length) return true
  if (d.weights.length) return true
  if (d.formulas.added.length || d.formulas.removed.length || d.formulas.changed.length) return true
  return d.indicators.changed.some((c) =>
    c.fields.some((f) => f.field !== 'label')
  )
}
