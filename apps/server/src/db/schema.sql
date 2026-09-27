CREATE TABLE IF NOT EXISTS analysts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_local INTEGER NOT NULL DEFAULT 0 CHECK (name_local IN (0,1)),
  email TEXT,
  time_zone TEXT NOT NULL DEFAULT 'Europe/Helsinki',
  time_zone_local INTEGER NOT NULL DEFAULT 0 CHECK (time_zone_local IN (0,1)),
  intros TEXT NOT NULL DEFAULT '{}',
  voice_sample_file TEXT,
  voice_id TEXT,
  clone_status TEXT NOT NULL DEFAULT 'none' CHECK (clone_status IN ('none','pending','ready','failed')),
  consent_date TEXT,
  consent_file TEXT,
  photo_file TEXT,
  default_expiry_days INTEGER NOT NULL DEFAULT 30,
  default_second_channel TEXT NOT NULL DEFAULT 'linkedin',
  brief_language TEXT NOT NULL DEFAULT 'en',
  alerts_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY,
  analyst_id INTEGER NOT NULL REFERENCES analysts(id),
  status TEXT NOT NULL CHECK (status IN ('draft','review','failed','link_sent','opened','form_sent','meeting_booked','lost','won')),
  review_reasons TEXT NOT NULL DEFAULT '[]',
  link_code TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL,
  page_language TEXT NOT NULL,
  country TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  scrape TEXT,
  financials TEXT,
  mgx TEXT,
  custom_questions TEXT NOT NULL DEFAULT '[]',
  removed_buyers TEXT NOT NULL DEFAULT '[]',
  form TEXT,
  form_sent_at TEXT,
  mgx_receipt_id TEXT,
  valuation TEXT,
  expiry_days INTEGER NOT NULL,
  published_at TEXT,
  published_version INTEGER,
  expires_at TEXT,
  expired_at TEXT,
  first_open_at TEXT,
  meeting_at TEXT,
  meeting_email TEXT,
  booked_at TEXT,
  lost_at TEXT,
  lost_reason TEXT,
  analytics TEXT,
  pipedrive_note_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS deals_analyst ON deals (analyst_id, status);
CREATE INDEX IF NOT EXISTS deals_expiry ON deals (expires_at) WHERE expired_at IS NULL;

CREATE TABLE IF NOT EXISTS timelines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  json TEXT NOT NULL,
  render_status TEXT NOT NULL DEFAULT 'pending' CHECK (render_status IN ('pending','rendering','rendered','failed')),
  approved_at TEXT,
  rendered_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (deal_id, version)
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('scrape','write-script','write-brief','audio','render','pipedrive-write','sweep','backup')),
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  run_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  deal_id INTEGER,
  analyst_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs (status, run_at, id);
CREATE INDEX IF NOT EXISTS jobs_deal ON jobs (deal_id, type, status);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  local_day TEXT NOT NULL,
  channel TEXT NOT NULL,
  device TEXT NOT NULL,
  browser TEXT NOT NULL,
  os TEXT NOT NULL,
  screen TEXT NOT NULL,
  analytics TEXT
);
CREATE INDEX IF NOT EXISTS sessions_deal ON sessions (deal_id, started_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  seq INTEGER,
  type TEXT NOT NULL,
  slide INTEGER,
  video_time REAL,
  channel TEXT,
  client_at TEXT,
  at TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  UNIQUE (session_id, seq)
);
CREATE INDEX IF NOT EXISTS events_deal ON events (deal_id, id);
CREATE INDEX IF NOT EXISTS events_type ON events (type, at);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('call','second_channel')),
  channel TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  pipedrive_activity_id INTEGER,
  created_at TEXT NOT NULL,
  done_at TEXT,
  UNIQUE (deal_id, type)
);
CREATE INDEX IF NOT EXISTS tasks_open ON tasks (status, deal_id);

CREATE TABLE IF NOT EXISTS briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  last_event_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (deal_id, version)
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
