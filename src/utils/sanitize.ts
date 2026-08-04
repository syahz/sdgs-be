import sanitizeHtml from 'sanitize-html'

/**
 * Input sanitization — menetralkan stored-XSS pada field teks bebas.
 * `theAnswers` / `qsAnswers`, judul, komentar review, dan pengumuman diisi user
 * sebagai teks bebas, jadi setiap string dibersihkan sebelum disimpan.
 *
 * Memakai parser HTML (sanitize-html, berbasis htmlparser2), BUKAN blacklist
 * regex. Regex single-pass yang dipakai sebelumnya bisa ditembus payload
 * bertingkat karena penghapusan tag bagian-dalam menyisakan teks yang membentuk
 * tag baru dan tidak pernah diproses ulang — temuan LOW-1 CSIRT DTI UB
 * (INC-2026-008), yang secara eksplisit merekomendasikan sanitize-html.
 * Parser bekerja atas struktur dokumen, jadi kelas bypass itu hilang, bukan
 * ditambal satu per satu.
 */

const STRIP_ALL: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  // Buang isi tag skriptable seluruhnya, jangan sisakan teks di dalamnya.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe'],
  disallowedTagsMode: 'discard'
}

/**
 * sanitize-html mengembalikan teks ber-entity HTML (`<` jadi `&lt;`). Untuk
 * aplikasi ini nilainya dirender sebagai TEKS (React auto-escape, ExcelJS
 * ValueType.String, jsPDF doc.text) — bukan sebagai HTML — sehingga entity
 * yang tertinggal akan tampil mentah di layar sebagai "&lt;".
 *
 * Decode dilakukan TEPAT SATU KALI dan hanya setelah parser membuang semua tag,
 * jadi tidak ada tag yang bisa terbentuk kembali: `<script>` sudah lenyap
 * sebelum tahap ini, sedangkan `&lt;` yang tersisa berasal dari karakter `<`
 * literal milik user (mis. "rasio < 5"). Input yang memang sudah ter-encode
 * ganda turun satu tingkat dan tetap berupa teks, tidak menjadi markup.
 */
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
}

function decodeOnce(input: string): string {
  return input.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
}

/** Karakter kontrol C0/C1 (kecuali tab, LF, CR) — tidak pernah sah di teks jawaban. */
function stripControlChars(input: string): string {
  let out = ''
  for (const ch of input) {
    const c = ch.codePointAt(0)!
    const isControl = (c >= 0x00 && c <= 0x1f && c !== 0x09 && c !== 0x0a && c !== 0x0d) || (c >= 0x7f && c <= 0x9f)
    if (!isControl) out += ch
  }
  return out
}

/** Buang seluruh markup HTML dari sebuah string, sisakan teksnya. */
export function sanitizeString(input: string): string {
  return decodeOnce(sanitizeHtml(stripControlChars(input), STRIP_ALL)).trim()
}

/** Sanitasi rekursif setiap nilai string di dalam struktur mirip-JSON. */
export function sanitizeJson<T>(value: T): T {
  if (typeof value === 'string') return sanitizeString(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => sanitizeJson(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeJson(v)
    return out as T
  }
  return value
}
