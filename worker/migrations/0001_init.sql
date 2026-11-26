-- Poweramps portal schema (Phase 1)

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,                        -- NULL for social-login-only accounts
  name TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'staff', 'admin')),
  email_verified_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE oauth_accounts (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, provider_user_id)
);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  next_path TEXT,
  expires_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX sessions_user ON sessions(user_id);

-- One-time links: email verification, password reset, anonymous quote confirmation
CREATE TABLE tokens (
  token_hash TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password', 'confirm_request')),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  request_id INTEGER,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

-- Quote requests and orders built in the panel builder
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('quote', 'order')),
  status TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL COLLATE NOCASE,
  contact_phone TEXT,
  contact_company TEXT,
  title TEXT NOT NULL,
  config TEXT NOT NULL,          -- JSON: everything chosen in the builder
  summary TEXT,                  -- JSON: computed loads, currents, incomer
  quantity INTEGER NOT NULL DEFAULT 1,
  site_location TEXT,
  required_by TEXT,
  notes TEXT,
  quote_amount REAL,
  quote_validity_days INTEGER,
  quote_note TEXT,
  quoted_at TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX requests_user ON requests(user_id);
CREATE INDEX requests_status ON requests(status);
CREATE INDEX requests_email ON requests(contact_email);

CREATE TABLE request_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  status TEXT,
  note TEXT,
  visible_to_client INTEGER NOT NULL DEFAULT 1,
  actor_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX request_events_req ON request_events(request_id);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
