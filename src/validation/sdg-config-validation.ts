import { z } from 'zod'

/**
 * Validasi STRUKTUR payload config indikator THE.
 *
 * `.strict()` di semua level bukan kerewelan: salah ketik `weigthInSdg` tanpa
 * itu akan lolos diam-diam, membuat bobot indikator jadi 0, dan menggeser skor
 * seluruh SDG tanpa satu pun pesan error. Lebih baik unggahan ditolak.
 *
 * Yang TIDAK dicek di sini: keterkaitan antar bagian (gate menunjuk indikator
 * yang ada, metric key yang dirujuk formula benar-benar ada, dst). Zod hanya
 * melihat satu simpul pada satu waktu — itu tugas config-lint.ts.
 */

const SubQuestionSchema = z
  .object({
    index: z.number().int().min(0),
    label: z.string().min(1),
    maxPoints: z.number().min(0),
    options: z
      .array(z.object({ value: z.number(), label: z.string() }).strict())
      .min(2),
  })
  .strict()

const QuantMetricSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    unit: z.string(),
  })
  .strict()

const ExistenceOptionSchema = z
  .object({
    id: z.string().min(1),
    value: z.number(),
    label: z.string().min(1),
  })
  .strict()

/** Union dibedakan lewat `mode` — tiap mode ditangani cabang berbeda di engine. */
const ExistenceScoringSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('binary') }).strict(),
  z.object({ mode: z.literal('select'), options: z.array(ExistenceOptionSchema).min(2) }).strict(),
  z
    .object({
      mode: z.literal('multi'),
      cap: z.number().positive(),
      options: z.array(ExistenceOptionSchema).min(2),
    })
    .strict(),
])

const IndicatorSchema = z
  .object({
    code: z.string().regex(/^\d{1,2}\.\d+\.\d+$/, 'Format kode harus "sdg.grup.urut", mis. "1.2.1"'),
    label: z.string().min(1),
    type: z.enum(['BIBLIOMETRIC', 'QUANTITATIVE', 'QUALITATIVE']),
    weightInSdg: z.number().min(0).max(100),
    maxScore: z.number().int().min(1).max(10).optional(),
    subQuestions: z.array(SubQuestionSchema).optional(),
    metrics: z.array(QuantMetricSchema).optional(),
    existenceScoring: ExistenceScoringSchema.optional(),
  })
  .strict()
  .superRefine((ind, ctx) => {
    const err = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message })

    if (ind.type === 'QUALITATIVE') {
      if (ind.maxScore === undefined) err(`${ind.code}: QUALITATIVE wajib punya maxScore`)
      if (ind.metrics) err(`${ind.code}: QUALITATIVE tidak boleh punya metrics`)
    }
    if (ind.type === 'QUANTITATIVE') {
      if (!ind.metrics || ind.metrics.length === 0) {
        err(`${ind.code}: QUANTITATIVE wajib punya minimal satu metric`)
      }
      if (ind.subQuestions) err(`${ind.code}: QUANTITATIVE tidak boleh punya subQuestions`)
      if (ind.existenceScoring) err(`${ind.code}: QUANTITATIVE tidak boleh punya existenceScoring`)
    }
    if (ind.type === 'BIBLIOMETRIC') {
      if (ind.metrics) err(`${ind.code}: BIBLIOMETRIC tidak boleh punya metrics`)
      if (ind.subQuestions) err(`${ind.code}: BIBLIOMETRIC tidak boleh punya subQuestions`)
      if (ind.existenceScoring) err(`${ind.code}: BIBLIOMETRIC tidak boleh punya existenceScoring`)
    }
    // Sub-pertanyaan tidak boleh MELEBIHI maxScore — itu pasti salah.
    // Boleh KURANG: indikator berpenilaian khusus (13.4.1 tingkat scope,
    // 13.4.2 tingkat tahun target) mendapat sisa poinnya dari engine, bukan
    // dari sub-pertanyaan. Ketidakcocokan di luar itu ditandai lint sebagai
    // peringatan, bukan ditolak di sini.
    if (ind.subQuestions && ind.maxScore !== undefined && ind.subQuestions.length > ind.maxScore) {
      err(`${ind.code}: jumlah subQuestions (${ind.subQuestions.length}) melebihi maxScore (${ind.maxScore})`)
    }
  })

const SdgSchema = z
  .object({
    number: z.number().int().min(1).max(17),
    title: z.string().min(1),
    emoji: z.string(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Warna harus hex 6 digit, mis. "#E5243B"'),
    mandatory: z.boolean(),
    indicators: z.array(IndicatorSchema).min(1),
  })
  .strict()

const SubjectPairSchema = z.object({ numerator: z.string(), denominator: z.string() }).strict()

/** Pola A–F sudah diimplementasikan engine. Pola lain = indikator tak akan pernah dinilai. */
const QuantFormulaSchema = z.discriminatedUnion('pattern', [
  z.object({ pattern: z.literal('A'), numerator: z.string(), denominator: z.string(), direction: z.enum(['higher', 'lower']), gate: z.string().optional() }).strict(),
  z.object({ pattern: z.literal('B'), numerator: z.string(), denominator: z.string(), direction: z.enum(['higher', 'lower']), gate: z.string().optional() }).strict(),
  z.object({ pattern: z.literal('C'), numerator: z.string(), denominator: z.string(), direction: z.enum(['higher', 'lower']), external: z.string().optional(), gate: z.string().optional() }).strict(),
  z.object({ pattern: z.literal('D'), numerator: z.string(), denominator: z.string(), direction: z.enum(['higher', 'lower']), gate: z.string().optional() }).strict(),
  z.object({ pattern: z.literal('E'), direction: z.enum(['higher', 'lower']), subjects: z.array(SubjectPairSchema).min(1), gate: z.string().optional() }).strict(),
  z.object({ pattern: z.literal('F'), countKey: z.string(), direction: z.enum(['higher', 'lower']), gate: z.string().optional() }).strict(),
])

export const SdgConfigPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    year: z.number().int().min(2020).max(2100),
    // Objek ber-key nomor SDG, sama seperti bentuk yang dipakai runtime.
    sdgs: z.record(z.string().regex(/^\d{1,2}$/), SdgSchema),
    quantFormulas: z.record(z.string(), QuantFormulaSchema),
    qualQuestions: z.record(z.string(), z.string()),
    groupTitles: z.record(z.string(), z.string()),
  })
  .strict()

export type ValidatedConfigPayload = z.infer<typeof SdgConfigPayloadSchema>
