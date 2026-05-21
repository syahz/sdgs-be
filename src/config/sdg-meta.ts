import { THE_SDG_CONFIG_2026 } from "./the-sdg-config";

export interface SdgMetaEntry {
  name: string;
  color: string;
}

export const SDG_META: Record<number, SdgMetaEntry> = Object.fromEntries(
  Object.entries(THE_SDG_CONFIG_2026).map(([id, cfg]) => [
    Number(id),
    { name: cfg.title, color: cfg.color },
  ])
) as Record<number, SdgMetaEntry>;

export const MANDATORY_SDGS = [1, 3, 4, 8, 17];

export const BAR_COLOR = "#3B5998";

export const CURRENT_YEAR = new Date().getFullYear();
export const THE_YEAR_OPTIONS = Array.from(
  { length: Math.max(1, CURRENT_YEAR - 2026 + 1) },
  (_, i) => 2026 + i
);
