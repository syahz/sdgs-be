import QS_SDG_CONFIG from '../config/qs-sdg-config'
import type { SdgConfigPayload } from '../config/config-registry'

/**
 * Pemeriksaan SEMANTIK config indikator — keterkaitan antar bagian yang tidak
 * bisa dilihat Zod, karena Zod hanya menilai satu simpul pada satu waktu.
 *
 * Di sinilah kesalahan yang benar-benar merusak muncul: `gate` menunjuk kode
 * indikator yang tidak ada, formula memakai nama metric yang salah ketik, atau
 * opsi `id: "whole"` diganti sehingga empat rasio kuantitatif diam-diam berhenti
 * dihitung. Semua itu lolos validasi struktur, tidak melempar error saat runtime,
 * dan hanya menampakkan diri sebagai skor yang tiba-tiba nol.
 */

export type IssueLevel = 'error' | 'warning'

export interface ConfigIssue {
  level: IssueLevel
  code: string
  /** Di mana masalahnya, mis. "sdgs.13.indicators.13.4.1" */
  path: string
  message: string
}

export interface LintResult {
  errors: ConfigIssue[]
  warnings: ConfigIssue[]
}

/** Opsi ber-id ini dipakai engine sebagai syarat gate kuantitatif. */
const GATE_OPTION_ID = 'whole'

/**
 * Indikator dengan rumus khusus di engine. maxScore-nya sengaja lebih besar
 * dari jumlah sub-pertanyaan karena sisa poinnya datang dari logika tersendiri
 * (13.4.1 tingkat cakupan scope, 13.4.2 tingkat tahun target).
 */
const SPECIAL_SCORING_CODES = new Set(['13.4.1', '13.4.2'])

export function lintConfig(payload: SdgConfigPayload): LintResult {
  const errors: ConfigIssue[] = []
  const warnings: ConfigIssue[] = []
  const err = (code: string, path: string, message: string) =>
    errors.push({ level: 'error', code, path, message })
  const warn = (code: string, path: string, message: string) =>
    warnings.push({ level: 'warning', code, path, message })

  const sdgs = Object.values(payload.sdgs ?? {})
  const allInd = sdgs.flatMap((s) => s.indicators)
  const byCode = new Map(allInd.map((i) => [i.code, i]))

  // ── S1: identitas indikator ────────────────────────────────────────────
  const seen = new Set<string>()
  for (const ind of allInd) {
    if (seen.has(ind.code)) {
      err('DUPLICATE_CODE', `indicators.${ind.code}`, `Kode indikator "${ind.code}" muncul lebih dari sekali`)
    }
    seen.add(ind.code)
  }
  for (const s of sdgs) {
    for (const ind of s.indicators) {
      const prefix = ind.code.split('.')[0]
      if (Number(prefix) !== s.number) {
        err(
          'CODE_SDG_MISMATCH',
          `sdgs.${s.number}.indicators.${ind.code}`,
          `Indikator "${ind.code}" ada di SDG ${s.number} — nomor depan kode harus ${s.number}`
        )
      }
    }
  }

  // ── S9: bobot per SDG ──────────────────────────────────────────────────
  for (const s of sdgs) {
    const total = s.indicators.reduce((a, i) => a + i.weightInSdg, 0)
    const selisih = Math.abs(total - 100)
    if (selisih > 1) {
      err('WEIGHT_SUM', `sdgs.${s.number}`, `Total bobot SDG ${s.number} = ${total.toFixed(2)}, seharusnya 100`)
    } else if (selisih > 0.05) {
      warn('WEIGHT_SUM', `sdgs.${s.number}`, `Total bobot SDG ${s.number} = ${total.toFixed(2)}, sedikit meleset dari 100`)
    }
  }

  // ── S2–S4: formula kuantitatif ─────────────────────────────────────────
  for (const [code, f] of Object.entries(payload.quantFormulas ?? {})) {
    const path = `quantFormulas.${code}`
    const ind = byCode.get(code)
    if (!ind) {
      err('FORMULA_ORPHAN', path, `Formula untuk "${code}" tapi indikatornya tidak ada`)
      continue
    }
    if (ind.type !== 'QUANTITATIVE') {
      err('FORMULA_WRONG_TYPE', path, `"${code}" bertipe ${ind.type}, formula kuantitatif tidak akan dipakai`)
      continue
    }

    const keys = new Set((ind.metrics ?? []).map((m) => m.key))
    const cekField = (nama: string, val?: string) => {
      if (!val) return
      if (!keys.has(val)) {
        err('FORMULA_FIELD_MISSING', path, `${nama} "${val}" tidak ada di metrics indikator "${code}"`)
      }
    }
    const anyF = f as unknown as Record<string, unknown>
    cekField('numerator', anyF.numerator as string)
    cekField('denominator', anyF.denominator as string)
    cekField('countKey', anyF.countKey as string)
    for (const p of (anyF.subjects as { numerator: string; denominator: string }[] | undefined) ?? []) {
      cekField('subjects.numerator', p.numerator)
      cekField('subjects.denominator', p.denominator)
    }

    // Gate: indikator penjaga harus ada, QUALITATIVE, dan punya opsi "whole".
    const gate = anyF.gate as string | undefined
    if (gate) {
      const g = byCode.get(gate)
      if (!g) {
        err('GATE_TARGET_INVALID', path, `gate "${gate}" menunjuk indikator yang tidak ada`)
      } else if (g.type !== 'QUALITATIVE') {
        err('GATE_TARGET_INVALID', path, `gate "${gate}" bertipe ${g.type}, harus QUALITATIVE`)
      } else {
        const es = g.existenceScoring
        const punya =
          es && es.mode !== 'binary' && es.options.some((o) => o.id === GATE_OPTION_ID)
        if (!punya) {
          err(
            'GATE_TARGET_INVALID',
            path,
            `gate "${gate}" harus punya opsi ber-id "${GATE_OPTION_ID}" — engine mensyaratkan itu, tanpanya rasio "${code}" tidak akan pernah dihitung`
          )
        }
      }
    }
  }

  // ── S5: referensi silang dari config QS ────────────────────────────────
  for (const q of QS_SDG_CONFIG as unknown as { code?: string; source?: { theCode: string; field: string } }[]) {
    const src = q?.source
    if (!src) continue
    const path = `qs.${q.code ?? src.theCode}`
    const ind = byCode.get(src.theCode)
    if (!ind) {
      err('QS_SOURCE_BROKEN', path, `Indikator QS merujuk "${src.theCode}" yang tidak ada di config ini`)
      continue
    }
    if (src.field !== 'answered') {
      const keys = new Set((ind.metrics ?? []).map((m) => m.key))
      if (!keys.has(src.field)) {
        err('QS_SOURCE_BROKEN', path, `Indikator QS merujuk field "${src.field}" yang tidak ada di metrics "${src.theCode}"`)
      }
    }
  }

  // ── S6–S7: opsi & sub-pertanyaan ───────────────────────────────────────
  for (const ind of allInd) {
    const es = ind.existenceScoring
    if (!es || es.mode === 'binary') continue
    const path = `indicators.${ind.code}.existenceScoring`

    const ids = new Set<string>()
    for (const o of es.options) {
      if (ids.has(o.id)) err('OPTION_ID_DUPLICATE', path, `id opsi "${o.id}" muncul dua kali di "${ind.code}"`)
      ids.add(o.id)
    }
    if (es.mode === 'multi') {
      // BUKAN error kalau jumlah nilai opsi sedikit di bawah cap: engine
      // mengembalikan cap penuh saat SEMUA opsi dicentang, justru untuk
      // menangani pembulatan seperti 3 x 0,33 = 0,99.
      // Selisih besar tetap ditandai — itu pertanda salah ketik nilai opsi.
      const jumlah = es.options.reduce((a, o) => a + o.value, 0)
      if (jumlah < es.cap * 0.9) {
        warn(
          'MULTI_CAP_LOW',
          path,
          `Total nilai opsi ${jumlah.toFixed(2)} jauh di bawah cap ${es.cap} — periksa apakah ada nilai opsi yang salah ketik`
        )
      }
    }
    const max = ind.maxScore ?? 3
    for (const o of es.options) {
      if (o.value > max) {
        err('OPTION_VALUE_TOO_HIGH', path, `opsi "${o.id}" bernilai ${o.value}, melebihi maxScore ${max}`)
      }
    }
  }

  // Ketidakcocokan maxScore vs sub-pertanyaan: peringatan, karena bisa saja
  // disengaja untuk indikator berpenilaian khusus.
  for (const ind of allInd) {
    if (!ind.subQuestions || ind.maxScore === undefined) continue
    if (SPECIAL_SCORING_CODES.has(ind.code)) continue
    if (ind.subQuestions.length !== ind.maxScore) {
      warn(
        'MAXSCORE_MISMATCH',
        `indicators.${ind.code}`,
        `maxScore ${ind.maxScore} tapi ada ${ind.subQuestions.length} sub-pertanyaan — skor maksimal tidak akan tercapai kecuali engine punya aturan khusus untuk indikator ini`
      )
    }
  }

  // ── S10–S11: teks ──────────────────────────────────────────────────────
  for (const [code] of Object.entries(payload.qualQuestions ?? {})) {
    if (!byCode.has(code)) {
      warn('QUESTION_ORPHAN', `qualQuestions.${code}`, `Pertanyaan untuk "${code}" tapi indikatornya tidak ada`)
    }
  }
  const grupNyata = new Set(allInd.map((i) => i.code.split('.').slice(0, 2).join('.')))
  for (const key of Object.keys(payload.groupTitles ?? {})) {
    if (!grupNyata.has(key)) {
      warn('GROUP_TITLE_ORPHAN', `groupTitles.${key}`, `Judul grup "${key}" tidak cocok grup indikator mana pun`)
    }
  }
  for (const ind of allInd) {
    if (ind.type === 'QUALITATIVE' && !payload.qualQuestions?.[ind.code]) {
      warn('QUESTION_MISSING', `indicators.${ind.code}`, `Belum ada teks pertanyaan — form akan menampilkan label sebagai gantinya`)
    }
  }

  return { errors, warnings }
}
