-- Adauga suport pentru joburi cron care ruleaza comenzi shell directe in loc de Claude.
-- Daca `command` e setat, scheduler-ul spawn-eaza acea comanda direct (bypass Claude).
-- Daca nu, foloseste calea existenta `claude -p {prompt}`.
-- Folosit pentru audituri deterministe (audit-startup, session-timeout, learnings-aggregator).

ALTER TABLE cron_jobs ADD COLUMN command TEXT;

-- Update schema version
INSERT OR REPLACE INTO schema_version (version) VALUES (3);
