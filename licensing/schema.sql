-- robOS licensing — D1 schema
-- Apply: wrangler d1 execute robos-licenses --file=licensing/schema.sql --remote

-- ============================================================================
-- licenses: core license records
-- ============================================================================
CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,                              -- uuid v4
  email TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'standard',            -- 'standard' | 'bundle'
  status TEXT NOT NULL DEFAULT 'active',            -- 'active' | 'revoked' | 'expired'
  source TEXT NOT NULL DEFAULT 'manual',            -- 'manual' | 'payment_app' | 'stripe' | 'lemon' | 'gift'
  source_ref TEXT,                                  -- payment id / charge ref / external order id
  amount_cents INTEGER,                             -- in cents EUR (for accounting)
  bundle_with_fda INTEGER NOT NULL DEFAULT 0,       -- 0/1: was sold as bundle with FdA
  version_entitlement TEXT NOT NULL DEFAULT '1',    -- '1' = v1.x; future '2' = v2.x
  notes TEXT,                                       -- internal admin notes
  created_at INTEGER NOT NULL,                      -- unix ms
  expires_at INTEGER,                               -- unix ms; NULL = never expires
  revoked_at INTEGER                                -- unix ms when revoked
);

CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_created ON licenses(created_at);

-- ============================================================================
-- binds: hardware bindings (one license -> N binds over time)
-- ============================================================================
CREATE TABLE IF NOT EXISTS binds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL,
  hardware_hash TEXT NOT NULL,                      -- sha256 hex
  os TEXT,                                          -- 'darwin-arm64' | 'linux-x86_64' | 'win32-x64'
  robos_version TEXT,
  ip TEXT,                                          -- CF-Connecting-IP
  user_agent TEXT,
  bound_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,                    -- updated on refresh/verify
  status TEXT NOT NULL DEFAULT 'active',            -- 'active' | 'replaced' | 'revoked'
  FOREIGN KEY (license_id) REFERENCES licenses(id)
);

CREATE INDEX IF NOT EXISTS idx_binds_license ON binds(license_id);
CREATE INDEX IF NOT EXISTS idx_binds_hardware ON binds(hardware_hash);
CREATE INDEX IF NOT EXISTS idx_binds_status ON binds(status);
CREATE INDEX IF NOT EXISTS idx_binds_bound_at ON binds(bound_at);

-- ============================================================================
-- events: full audit log (license-scoped + global)
-- ============================================================================
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT,                                  -- nullable for global events
  event_type TEXT NOT NULL,
  -- types: 'license_created', 'bind', 'refresh', 'rebind', 'rebind_blocked',
  --        'revoke', 'reactivate', 'email_sent', 'download', 'verify_failed',
  --        'admin_login', 'admin_action'
  details TEXT,                                     -- JSON blob, event-specific
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_license ON events(license_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

-- ============================================================================
-- magic_links: one-time admin login tokens (5-min TTL)
-- ============================================================================
CREATE TABLE IF NOT EXISTS magic_links (
  token TEXT PRIMARY KEY,                           -- 64-hex random
  email TEXT NOT NULL,                              -- must match ADMIN_EMAIL
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,                      -- created_at + 5 min
  used_at INTEGER                                   -- non-null = consumed (single-use)
);

CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);
CREATE INDEX IF NOT EXISTS idx_magic_links_expires ON magic_links(expires_at);

-- ============================================================================
-- admin_sessions: post-magic-link sessions (24h TTL)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,                           -- 64-hex random, in cookie
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,                      -- created_at + 24h
  ip TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

-- ============================================================================
-- download_tokens: signed download links (7d TTL)
-- ============================================================================
CREATE TABLE IF NOT EXISTS download_tokens (
  token TEXT PRIMARY KEY,                           -- short id in /dl/{token}
  license_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_count INTEGER NOT NULL DEFAULT 0,        -- track how many times downloaded
  FOREIGN KEY (license_id) REFERENCES licenses(id)
);

CREATE INDEX IF NOT EXISTS idx_download_tokens_license ON download_tokens(license_id);
CREATE INDEX IF NOT EXISTS idx_download_tokens_expires ON download_tokens(expires_at);

-- ============================================================================
-- meta: schema version + global config
-- ============================================================================
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO meta (key, value) VALUES ('current_robos_version', '0.4.0');
