CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'active', 'review', 'done', 'cancelled')),
  clientId TEXT,
  projectSlug TEXT,
  goalGroup TEXT,
  tag TEXT,
  model TEXT,
  permissionMode TEXT DEFAULT 'bypass',
  claudeSessionId TEXT,
  claudePid INTEGER,
  level INTEGER DEFAULT 1 CHECK (level IN (1, 2, 3)),
  phaseNumber INTEGER,
  parentTaskId TEXT REFERENCES tasks(id),
  dependsOn TEXT,
  needsInput INTEGER DEFAULT 0,
  pinnedAt TEXT,
  startSnapshot TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  completedAt TEXT
);

CREATE TABLE IF NOT EXISTS task_logs (
  id TEXT PRIMARY KEY,
  taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('text', 'tool_use', 'tool_result', 'question', 'user_reply', 'system')),
  content TEXT NOT NULL DEFAULT '',
  toolName TEXT,
  toolArgs TEXT,
  toolResult TEXT,
  isCollapsed INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cron_jobs (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  schedule TEXT NOT NULL,
  days TEXT DEFAULT 'daily',
  model TEXT DEFAULT 'sonnet',
  prompt TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  timeout TEXT DEFAULT '30m',
  retries INTEGER DEFAULT 0,
  notify TEXT DEFAULT 'on_finish',
  clientId TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cron_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jobSlug TEXT NOT NULL REFERENCES cron_jobs(slug),
  taskId TEXT REFERENCES tasks(id),
  trigger TEXT DEFAULT 'scheduled' CHECK (trigger IN ('scheduled', 'manual', 'catchup')),
  result TEXT DEFAULT 'running' CHECK (result IN ('success', 'failure', 'timeout', 'running')),
  startedAt TEXT NOT NULL,
  completedAt TEXT,
  durationSec REAL,
  exitCode INTEGER
);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_clientId ON tasks(clientId);
-- goalGroup index removed (column exists but unused in queries)
CREATE INDEX IF NOT EXISTS idx_task_logs_taskId ON task_logs(taskId);
CREATE INDEX IF NOT EXISTS idx_cron_runs_jobSlug ON cron_runs(jobSlug);
CREATE INDEX IF NOT EXISTS idx_cron_runs_startedAt ON cron_runs(startedAt);
