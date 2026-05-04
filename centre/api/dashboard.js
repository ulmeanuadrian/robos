import { getDb } from '../lib/db.js';
import { listSkills } from './skills.js';
import { execSync } from 'child_process';

/**
 * GET /api/dashboard/summary
 * Returns aggregated stats for the home page.
 */
export function getSummary() {
  const db = getDb();

  const activeTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'active'").get()?.count ?? 0;
  const reviewTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'review'").get()?.count ?? 0;

  let skillsCount = 0;
  try {
    skillsCount = listSkills().length;
  } catch {
    skillsCount = 0;
  }

  const cronActive = db.prepare("SELECT COUNT(*) as count FROM cron_jobs WHERE active = 1").get()?.count ?? 0;

  // Recent activity: last 5 completed tasks
  const recentActivity = db.prepare(`
    SELECT id, title, status, completedAt, updatedAt FROM tasks
    WHERE status = 'done'
    ORDER BY completedAt DESC
    LIMIT 5
  `).all();

  return {
    activeTasks,
    reviewTasks,
    skillsCount,
    cronActive,
    recentActivity,
  };
}

/**
 * GET /api/dashboard/health
 * Returns system health checks.
 */
export function getHealth() {
  let claudeCli = false;
  try {
    execSync('which claude', { stdio: 'pipe' });
    claudeCli = true;
  } catch { /* not found */ }

  return { claudeCli };
}
