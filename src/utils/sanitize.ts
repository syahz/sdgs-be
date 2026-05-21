/**
 * Input sanitization — neutralize stored-XSS in free-text answer fields.
 * Submission `theAnswers` / `qsAnswers` are arbitrary JSON filled by users;
 * strip HTML tags and dangerous protocols/handlers from every string value
 * before persisting.
 */

/** Strip HTML tags, `javascript:` URIs, and inline event handlers from a string. */
export function sanitizeString(input: string): string {
  return input
    .replace(/<[^>]*>/g, '') // strip HTML/XML tags
    .replace(/javascript:/gi, '') // strip javascript: protocol
    .replace(/data:text\/html/gi, '') // strip data-html payloads
    .replace(/on\w+\s*=/gi, '') // strip inline event handlers (onerror=, onclick=, ...)
    .trim()
}

/** Recursively sanitize every string value inside a JSON-like value. */
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
