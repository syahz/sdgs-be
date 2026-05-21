/**
 * Submission window utility — configurable via SystemSettings.
 * Faculty admins can only submit during this window.
 */

export interface SubmissionWindow {
  start: Date;
  end: Date;
  year: number;
}

export interface WindowConfig {
  submissionYear: number;
  windowStartMonth: number;
  windowStartDay: number;
  windowEndMonth: number;
  windowEndDay: number;
}

export function getSubmissionWindowFromConfig(cfg: WindowConfig): SubmissionWindow {
  return {
    year: cfg.submissionYear,
    start: new Date(cfg.submissionYear, cfg.windowStartMonth - 1, cfg.windowStartDay),
    end: new Date(cfg.submissionYear, cfg.windowEndMonth - 1, cfg.windowEndDay, 23, 59, 59)
  };
}

/** Default fallback: July 1 – September 15 */
export function getDefaultSubmissionWindow(year: number = new Date().getFullYear()): SubmissionWindow {
  return {
    year,
    start: new Date(year, 6, 1),
    end: new Date(year, 8, 15, 23, 59, 59)
  };
}

export function isWithinWindow(window: SubmissionWindow, now: Date = new Date()): boolean {
  return now >= window.start && now <= window.end;
}

export function isCutoffPassed(window: SubmissionWindow, now: Date = new Date()): boolean {
  return now > window.end;
}

/** Current submission year (calendar year). */
export const SUBMISSION_YEAR = new Date().getFullYear();
