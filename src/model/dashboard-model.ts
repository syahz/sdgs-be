export interface SdgScoreEntry {
  sdgId: number
  sdgName: string
  totalPoints: number
  color: string
}

export interface OverallDashboardResponse {
  overall: number
  sdg17Score: number
  topSdgs: SdgScoreEntry[]
  allSdgScores: SdgScoreEntry[]
}

export interface OrgUnitScoreEntry {
  orgUnitId: string
  orgUnitName: string
  orgUnitAbbreviation: string
  totalScore: number
  rank: number
  sdgScores: Record<number, number>
}

export interface SdgIndicatorBreakdown {
  indicatorCode: string
  indicatorLabel: string
  type: string
  contribution: number
}

export interface SdgDetailResponse {
  sdgId: number
  sdgName: string
  color: string
  avgPoints: number
  submissions: {
    orgUnitId: string
    orgUnitName: string
    points: number
    status: string
  }[]
}
