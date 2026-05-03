import { getDb } from '../lib/db.js';

/**
 * GET /api/analytics/skills
 * Per-skill stats: total runs, avg cost, avg duration, avg quality, trend.
 */
export function getSkillStats() {
  const db = getDb();

  const skills = db.prepare(`
    SELECT
      skillName,
      COUNT(*) as totalRuns,
      ROUND(AVG(costUsd), 4) as avgCost,
      ROUND(AVG(durationSec), 1) as avgDuration,
      ROUND(AVG(qualityScore), 1) as avgQuality
    FROM skill_runs
    GROUP BY skillName
    ORDER BY totalRuns DESC
  `).all();

  // Trend: compare last 7 days vs previous 7 days
  const trends = db.prepare(`
    SELECT
      skillName,
      SUM(CASE WHEN createdAt >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as recent,
      SUM(CASE WHEN createdAt >= datetime('now', '-14 days') AND createdAt < datetime('now', '-7 days') THEN 1 ELSE 0 END) as previous
    FROM skill_runs
    WHERE createdAt >= datetime('now', '-14 days')
    GROUP BY skillName
  `).all();

  const trendMap = {};
  for (const t of trends) {
    if (t.recent > t.previous) trendMap[t.skillName] = 'up';
    else if (t.recent < t.previous) trendMap[t.skillName] = 'down';
    else trendMap[t.skillName] = 'flat';
  }

  return skills.map(s => ({
    ...s,
    trend: trendMap[s.skillName] || 'flat',
  }));
}

/**
 * GET /api/analytics/costs
 * Cost breakdown: today, this week, this month. Per-skill and per-client.
 */
export function getCostBreakdown() {
  const db = getDb();

  const periods = db.prepare(`
    SELECT
      ROUND(SUM(CASE WHEN createdAt >= datetime('now', 'start of day') THEN costUsd ELSE 0 END), 4) as today,
      ROUND(SUM(CASE WHEN createdAt >= datetime('now', '-7 days') THEN costUsd ELSE 0 END), 4) as thisWeek,
      ROUND(SUM(CASE WHEN createdAt >= datetime('now', 'start of month') THEN costUsd ELSE 0 END), 4) as thisMonth
    FROM skill_runs
  `).get();

  const perSkill = db.prepare(`
    SELECT
      skillName,
      ROUND(SUM(costUsd), 4) as totalCost,
      COUNT(*) as runs
    FROM skill_runs
    WHERE createdAt >= datetime('now', 'start of month')
    GROUP BY skillName
    ORDER BY totalCost DESC
  `).all();

  const perClient = db.prepare(`
    SELECT
      COALESCE(clientId, 'unknown') as clientId,
      ROUND(SUM(costUsd), 4) as totalCost,
      COUNT(*) as runs
    FROM skill_runs
    WHERE createdAt >= datetime('now', 'start of month')
    GROUP BY clientId
    ORDER BY totalCost DESC
  `).all();

  return {
    today: periods?.today ?? 0,
    thisWeek: periods?.thisWeek ?? 0,
    thisMonth: periods?.thisMonth ?? 0,
    perSkill,
    perClient,
  };
}

/**
 * GET /api/analytics/quality
 * Quality scores over time, per-skill average, top/bottom skills.
 */
export function getQualityStats() {
  const db = getDb();

  // Daily average quality for the last 30 days
  const overTime = db.prepare(`
    SELECT
      date(createdAt) as day,
      ROUND(AVG(qualityScore), 1) as avgQuality,
      COUNT(*) as runs
    FROM skill_runs
    WHERE qualityScore IS NOT NULL
      AND createdAt >= datetime('now', '-30 days')
    GROUP BY date(createdAt)
    ORDER BY day ASC
  `).all();

  // Per-skill average quality
  const perSkill = db.prepare(`
    SELECT
      skillName,
      ROUND(AVG(qualityScore), 1) as avgQuality,
      COUNT(*) as runs
    FROM skill_runs
    WHERE qualityScore IS NOT NULL
    GROUP BY skillName
    ORDER BY avgQuality DESC
  `).all();

  const topSkills = perSkill.slice(0, 5);
  const bottomSkills = perSkill.length > 5 ? perSkill.slice(-5).reverse() : [];

  return {
    overTime,
    perSkill,
    topSkills,
    bottomSkills,
  };
}
