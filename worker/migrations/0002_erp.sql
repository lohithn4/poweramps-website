-- Phase 2 + 3: quotations, feedback & testimonials, mini-ERP, Tally import/export

-- Allow feedback links in one-time tokens (SQLite cannot alter a CHECK, so rebuild the table).
CREATE TABLE tokens_new (
  token_hash TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password', 'confirm_request', 'feedback')),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  request_id INTEGER,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
INSERT INTO tokens_new SELECT token_hash, purpose, user_id, request_id, expires_at, used_at FROM tokens;
DROP TABLE tokens;
ALTER TABLE tokens_new RENAME TO tokens;

-- Key/value settings (bank details, terms, numbering, Tally ledger names)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Gap-free document numbering per type and financial year
CREATE TABLE counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- Customers, suppliers and lenders (Tally: Sundry Debtors / Sundry Creditors / Loans)
CREATE TABLE parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('customer', 'supplier', 'lender')),
  name TEXT NOT NULL,
  contact_person TEXT,
  gstin TEXT,
  state_code TEXT,
  address TEXT,
  city TEXT,
  pincode TEXT,
  phone TEXT,
  email TEXT COLLATE NOCASE,
  opening_balance REAL NOT NULL DEFAULT 0,   -- customer: they owe us; supplier/lender: we owe them
  credit_days INTEGER,
  user_id INTEGER REFERENCES users(id),
  tally_name TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX parties_kind_name ON parties(kind, name COLLATE NOCASE);
CREATE INDEX parties_email ON parties(email);
CREATE INDEX parties_user ON parties(user_id);
CREATE INDEX parties_gstin ON parties(gstin);

-- Items / components / services (Tally: Stock Items)
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  name TEXT NOT NULL,
  make TEXT,
  description TEXT,
  category TEXT,
  hsn TEXT,
  gst_rate REAL NOT NULL DEFAULT 18,
  unit TEXT NOT NULL DEFAULT 'Nos',
  sale_rate REAL NOT NULL DEFAULT 0,
  purchase_rate REAL NOT NULL DEFAULT 0,
  opening_qty REAL NOT NULL DEFAULT 0,
  reorder_level REAL,
  is_service INTEGER NOT NULL DEFAULT 0,
  tally_name TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX items_name ON items(name COLLATE NOCASE);
CREATE INDEX items_code ON items(code);

-- BOQs, quotations, tax invoices and purchase bills
CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('boq', 'quotation', 'invoice', 'purchase')),
  number TEXT,                       -- assigned when issued (drafts have none)
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'sent', 'accepted', 'cancelled')),
  party_id INTEGER REFERENCES parties(id),
  request_id INTEGER REFERENCES requests(id),
  source_doc_id INTEGER REFERENCES documents(id),
  doc_date TEXT NOT NULL,
  due_date TEXT,
  valid_until TEXT,
  ref_no TEXT,                       -- client PO no. (sales) or supplier bill no. (purchases)
  ref_date TEXT,
  -- party snapshot, so issued documents never change when the party is edited
  party_name TEXT,
  party_gstin TEXT,
  party_address TEXT,
  party_state_code TEXT,
  ship_to TEXT,
  place_of_supply TEXT,              -- GST state code
  reverse_charge INTEGER NOT NULL DEFAULT 0,
  subject TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  taxable REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  igst REAL NOT NULL DEFAULT 0,
  round_off REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  tally_exported_at TEXT,
  created_by INTEGER REFERENCES users(id),
  issued_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX documents_number ON documents(type, number) WHERE number IS NOT NULL;
CREATE INDEX documents_party ON documents(party_id);
CREATE INDEX documents_request ON documents(request_id);
CREATE INDEX documents_type_date ON documents(type, doc_date);

CREATE TABLE doc_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0,
  item_id INTEGER REFERENCES items(id),
  description TEXT NOT NULL,
  make TEXT,
  hsn TEXT,
  qty REAL NOT NULL DEFAULT 1,
  unit TEXT,
  rate REAL NOT NULL DEFAULT 0,
  discount_pct REAL NOT NULL DEFAULT 0,
  gst_rate REAL NOT NULL DEFAULT 0,
  cost_rate REAL,
  taxable REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  igst REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0
);
CREATE INDEX doc_lines_doc ON doc_lines(doc_id);
CREATE INDEX doc_lines_item ON doc_lines(item_id);

-- Money in and out: receipts, supplier payments, loans
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('receipt', 'payment', 'loan_received', 'loan_repayment')),
  party_id INTEGER NOT NULL REFERENCES parties(id),
  doc_id INTEGER REFERENCES documents(id),
  pay_date TEXT NOT NULL,
  amount REAL NOT NULL,
  interest REAL NOT NULL DEFAULT 0,  -- loan repayments: interest portion of amount
  tds REAL NOT NULL DEFAULT 0,       -- receipts: TDS deducted by the customer
  mode TEXT NOT NULL DEFAULT 'bank',
  reference TEXT,
  notes TEXT,
  cancelled INTEGER NOT NULL DEFAULT 0,
  tally_exported_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX payments_number ON payments(kind, number) WHERE number IS NOT NULL;
CREATE INDEX payments_party ON payments(party_id);
CREATE INDEX payments_doc ON payments(doc_id);
CREATE INDEX payments_date ON payments(pay_date);

-- Post-delivery feedback; 9-10 ratings with consent become testimonials after staff approval
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL UNIQUE REFERENCES requests(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 10),
  comment TEXT,
  consent INTEGER NOT NULL DEFAULT 0,
  display_name TEXT,
  company TEXT,
  role TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'pending', 'published', 'hidden')),
  reviewed_by INTEGER REFERENCES users(id),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX feedback_status ON feedback(status);

-- Import history (Tally / CSV)
CREATE TABLE import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  source TEXT,
  mode TEXT NOT NULL,
  created INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  actor_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE requests ADD COLUMN party_id INTEGER REFERENCES parties(id);
ALTER TABLE requests ADD COLUMN quote_doc_id INTEGER REFERENCES documents(id);
ALTER TABLE requests ADD COLUMN delivered_at TEXT;
