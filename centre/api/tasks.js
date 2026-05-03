import { randomUUID } from 'crypto';
import { getDb } from '../lib/db.js';
import { emit } from '../lib/event-bus.js';

/**
 * GET /api/tasks — list tasks with optional filters
 * Query params: status, clientId, limit
 */
export function listTasks(query) {
  const db = getDb();
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (query.status) {
    sql += ' AND status = ?';
    params.push(query.status);
  }
  if (query.clientId) {
    sql += ' AND clientId = ?';
    params.push(query.clientId);
  }

  sql += ' ORDER BY updatedAt DESC';

  if (query.limit) {
    sql += ' LIMIT ?';
    params.push(parseInt(query.limit, 10));
  }

  return db.prepare(sql).all(...params);
}

/**
 * POST /api/tasks — create a new task
 */
export function createTask(body) {
  const db = getDb();
  const id = body.id || randomUUID();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO tasks (id, title, description, status, clientId, projectSlug, goalGroup, tag, model, permissionMode, level, parentTaskId, dependsOn, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    body.title || 'Untitled Task',
    body.description || null,
    body.status || 'backlog',
    body.clientId || null,
    body.projectSlug || null,
    body.goalGroup || null,
    body.tag || null,
    body.model || null,
    body.permissionMode || 'bypass',
    body.level || 1,
    body.parentTaskId || null,
    body.dependsOn ? JSON.stringify(body.dependsOn) : null,
    now,
    now
  );

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  emit('task:created', task);
  return task;
}

/**
 * GET /api/tasks/:id — get a task with its logs
 */
export function getTask(id) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return null;

  const logs = db.prepare('SELECT * FROM task_logs WHERE taskId = ? ORDER BY createdAt ASC').all(id);
  return { ...task, logs };
}

/**
 * PATCH /api/tasks/:id — update a task
 */
export function updateTask(id, body) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) return null;

  const fields = [];
  const params = [];

  const allowedFields = ['title', 'description', 'status', 'clientId', 'projectSlug', 'goalGroup', 'tag', 'model', 'permissionMode', 'claudeSessionId', 'claudePid', 'level', 'phaseNumber', 'parentTaskId', 'dependsOn', 'needsInput', 'pinnedAt'];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      fields.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  if (body.status === 'done' && existing.status !== 'done') {
    fields.push('completedAt = ?');
    params.push(new Date().toISOString());
  }

  if (fields.length === 0) return existing;

  fields.push('updatedAt = ?');
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  emit('task:updated', updated);
  return updated;
}

/**
 * DELETE /api/tasks/:id — delete a task and its logs
 */
export function deleteTask(id) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) return false;

  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  emit('task:deleted', { id });
  return true;
}
