import { prismaClient } from '../application/database'
import { SDG_META } from '../config/sdg-meta'
import { OverallDashboardResponse, OrgUnitScoreEntry, SdgDetailResponse } from '../model/dashboard-model'
import { getSettingsService } from './settings-service'

/**
 * University overall score:
 *   SDG17 × 22% + Top1 × 26% + Top2 × 26% + Top3 × 26%
 */
function computeUniversityOverall(sdgScores: Record<number, number>): { overall: number; sdg17Score: number; topSdgs: { sdgId: number; score: number }[] } {
  const sdg17Score = sdgScores[17] ?? 0
  const others = Object.entries(sdgScores)
    .filter(([id]) => Number(id) !== 17)
    .map(([id, score]) => ({ sdgId: Number(id), score }))
    .sort((a, b) => b.score - a.score)

  const top3 = others.slice(0, 3)
  const topTotal = top3.reduce((sum, e) => sum + e.score, 0)
  const topWeighted = top3.length > 0 ? (topTotal / top3.length) * 0.78 : 0
  const overall = parseFloat((sdg17Score * 0.22 + topWeighted).toFixed(4))

  return { overall, sdg17Score, topSdgs: top3 }
}

export const getOverallDashboardService = async (year?: number): Promise<OverallDashboardResponse> => {
  const settings = await getSettingsService()
  const targetYear = year ?? settings.submissionYear

  // Get all approved submissions for the year
  const submissions = await prismaClient.submission.findMany({
    where: { year: targetYear, status: 'approved' },
    select: { sdgId: true, points: true }
  })

  // Aggregate: average points per SDG across all org units
  const sdgTotals: Record<number, { sum: number; count: number }> = {}
  for (const sub of submissions) {
    if (!sdgTotals[sub.sdgId]) sdgTotals[sub.sdgId] = { sum: 0, count: 0 }
    sdgTotals[sub.sdgId].sum += sub.points
    sdgTotals[sub.sdgId].count += 1
  }

  const sdgScores: Record<number, number> = {}
  for (const [id, { sum, count }] of Object.entries(sdgTotals)) {
    sdgScores[Number(id)] = count > 0 ? parseFloat((sum / count).toFixed(4)) : 0
  }

  const { overall, sdg17Score, topSdgs } = computeUniversityOverall(sdgScores)

  const allSdgScores = Object.entries(sdgScores).map(([id, score]) => {
    const numId = Number(id)
    const meta = SDG_META[numId]
    return { sdgId: numId, sdgName: meta?.name ?? `SDG ${numId}`, totalPoints: score, color: meta?.color ?? '#888' }
  }).sort((a, b) => a.sdgId - b.sdgId)

  const topSdgEntries = topSdgs.map(({ sdgId, score }) => {
    const meta = SDG_META[sdgId]
    return { sdgId, sdgName: meta?.name ?? `SDG ${sdgId}`, totalPoints: score, color: meta?.color ?? '#888' }
  })

  return { overall, sdg17Score, topSdgs: topSdgEntries, allSdgScores }
}

export const getOrgUnitRankingService = async (year?: number): Promise<OrgUnitScoreEntry[]> => {
  const settings = await getSettingsService()
  const targetYear = year ?? settings.submissionYear

  const submissions = await prismaClient.submission.findMany({
    where: { year: targetYear, status: 'approved' },
    select: { orgUnitId: true, sdgId: true, points: true },
    include: { orgUnit: true }
  } as any)

  // Group by orgUnit
  const orgMap: Record<string, { name: string; abbreviation: string; sdgScores: Record<number, number> }> = {}

  for (const sub of submissions as any[]) {
    if (!orgMap[sub.orgUnitId]) {
      orgMap[sub.orgUnitId] = {
        name: sub.orgUnit.name,
        abbreviation: sub.orgUnit.abbreviation ?? '',
        sdgScores: {}
      }
    }
    orgMap[sub.orgUnitId].sdgScores[sub.sdgId] = sub.points
  }

  const entries: OrgUnitScoreEntry[] = Object.entries(orgMap).map(([orgUnitId, data]) => {
    const { overall } = computeUniversityOverall(data.sdgScores)
    return {
      orgUnitId,
      orgUnitName: data.name,
      orgUnitAbbreviation: data.abbreviation,
      totalScore: overall,
      rank: 0,
      sdgScores: data.sdgScores
    }
  })

  entries.sort((a, b) => b.totalScore - a.totalScore)
  entries.forEach((e, i) => { e.rank = i + 1 })

  return entries
}

export const getSdgDetailService = async (sdgId: number, year?: number): Promise<SdgDetailResponse> => {
  const settings = await getSettingsService()
  const targetYear = year ?? settings.submissionYear
  const meta = SDG_META[sdgId]

  const submissions = await prismaClient.submission.findMany({
    where: { year: targetYear, sdgId, status: 'approved' },
    include: { orgUnit: { select: { id: true, name: true } } }
  })

  const subList = submissions.map((s) => ({
    orgUnitId: s.orgUnitId,
    orgUnitName: (s as any).orgUnit?.name ?? '',
    points: s.points,
    status: s.status
  }))

  const avgPoints = subList.length > 0
    ? parseFloat((subList.reduce((sum, s) => sum + s.points, 0) / subList.length).toFixed(4))
    : 0

  return {
    sdgId,
    sdgName: meta?.name ?? `SDG ${sdgId}`,
    color: meta?.color ?? '#888',
    avgPoints,
    submissions: subList
  }
}
