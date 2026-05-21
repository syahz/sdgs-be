/**
 * Translate THE indicator `code` (e.g. "1.2.1") to its storage key in
 * `submission.theAnswers` ("THE_1_2_1"). Mirrors the `qsAnswers`/`QS_x_y`
 * naming so db keys are visually symmetric across both rankings.
 *
 * Keep `ind.code = "1.2.1"` everywhere in the codebase (config, lookups,
 * UI display, hardcoded checks). Only the storage key changes shape.
 */
export function theKey(code: string): string {
  return `THE_${code.replace(/\./g, "_")}`;
}

/** Inverse of `theKey`. `"THE_1_2_1"` → `"1.2.1"`. */
export function theKeyToCode(key: string): string {
  return key.startsWith("THE_") ? key.slice(4).replace(/_/g, ".") : key;
}

/**
 * Storage → in-memory shape. Convert keys like `"THE_1_2_1"` back to `"1.2.1"`
 * so the form/scoring engine can keep using methodology-style codes.
 * Tolerant: keys that don't match the prefix are passed through (helps when
 * mid-migration data still carries old `"1.2.1"` keys).
 */
export function unwrapTheAnswers<T>(stored: Record<string, T> | null | undefined): Record<string, T> {
  if (!stored) return {};
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(stored)) {
    out[theKeyToCode(k)] = v;
  }
  return out;
}

/** In-memory → storage shape. `"1.2.1"` → `"THE_1_2_1"`. Already-prefixed keys pass through. */
export function wrapTheAnswers<T>(inMem: Record<string, T> | null | undefined): Record<string, T> {
  if (!inMem) return {};
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(inMem)) {
    const key = k.startsWith("THE_") ? k : theKey(k);
    out[key] = v;
  }
  return out;
}
