CREATE TABLE IF NOT EXISTS skill_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skillName TEXT NOT NULL,
  taskId TEXT REFERENCES tasks(id),
  clientId TEXT,
  model TEXT,
  inputTokens INTEGER,
  outputTokens INTEGER,
  costUsd REAL,
  durationSec REAL,
  qualityScore REAL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_skill_runs_skillName ON skill_runs(skillName);
CREATE INDEX IF NOT EXISTS idx_skill_runs_createdAt ON skill_runs(createdAt);
CREATE INDEX IF NOT EXISTS idx_skill_runs_clientId ON skill_runs(clientId);

-- Update schema version
UPDATE schema_version SET version = 2 WHERE version = 1;
