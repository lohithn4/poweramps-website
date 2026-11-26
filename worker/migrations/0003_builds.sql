-- Saved panel builds ("My builds"): clients configure one or more panels, then request
-- one quotation / order for several of them together.
CREATE TABLE builds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL,          -- JSON: everything chosen in the builder
  summary TEXT,                  -- JSON: computed ratings
  request_id INTEGER REFERENCES requests(id) ON DELETE SET NULL,  -- set once sent for quote / order
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX builds_user ON builds(user_id, updated_at);

-- A request can now carry several panels: JSON array of { name, title, quantity, config, summary }.
-- config / summary keep the first panel for older screens.
ALTER TABLE requests ADD COLUMN panels TEXT;
