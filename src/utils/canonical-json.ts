/**
 * JSON dengan key tersortir rekursif.
 *
 * Dipakai untuk checksum DAN pembandingan. Tanpa ini, dua objek beris i sama
 * dengan urutan key berbeda dianggap berbeda — dan diff config melaporkan
 * ratusan indikator "berubah" padahal tak satu pun nilainya bergeser, karena
 * objek dari modul TypeScript punya urutan key berbeda dari hasil round-trip JSON.
 */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(',')}}`
}

/** Dua nilai setara secara isi, tanpa peduli urutan key. */
export function deepEqual(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b)
}
