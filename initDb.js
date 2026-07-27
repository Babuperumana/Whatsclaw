const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Keep the DB location in sync with server.js (DATA_DIR volume in production).
const DATA_DIR = process.env.DATA_DIR || __dirname;
const dbPath = path.resolve(DATA_DIR, 'database.sqlite');
console.log('Initializing SQLite database at', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
    process.exit(1);
  }
});

const schema = `
-- Drop tables if they exist to start fresh
DROP TABLE IF EXISTS api_settings;
DROP TABLE IF EXISTS bharatpe_session_information;
DROP TABLE IF EXISTS bharatpe_tokens;
DROP TABLE IF EXISTS callback_report;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS payment_links;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS settlement;
DROP TABLE IF EXISTS site_settings;
DROP TABLE IF EXISTS subscription_plan;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS vazhipadu_master;
DROP TABLE IF EXISTS vazhipadu_bookings;
DROP TABLE IF EXISTS donations_payment_details;
DROP TABLE IF EXISTS devotees;
DROP TABLE IF EXISTS special_days;
DROP TABLE IF EXISTS nakshathra_pooja;
DROP TABLE IF EXISTS reminder_runs;

CREATE TABLE api_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  whatsapp_api_url TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  api_key TEXT NOT NULL,
  sender_email TEXT NOT NULL
);

INSERT INTO api_settings (id, whatsapp_api_url, sender_id, api_key, sender_email) VALUES
(1, 'wa.pay0.shop/api', 'YOUR_APP_KEY', 'YOUR_AUTH_KEY', 'info@kaippullitemple.online');

CREATE TABLE bharatpe_session_information (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  upi_id TEXT NOT NULL,
  amount REAL NOT NULL,
  session_amount REAL NOT NULL,
  pay_token TEXT UNIQUE NOT NULL,
  create_timestamp DATETIME NOT NULL,
  expire_timestamp DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  utr TEXT DEFAULT NULL,
  is_session_am_set TEXT NOT NULL DEFAULT 'no'
);

CREATE TABLE bharatpe_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_token TEXT DEFAULT NULL,
  phoneNumber TEXT DEFAULT NULL,
  token TEXT DEFAULT NULL,
  cookie TEXT DEFAULT NULL,
  merchantId TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  date DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'Deactive',
  Upiid TEXT DEFAULT NULL,
  user_id INTEGER DEFAULT NULL
);

INSERT INTO bharatpe_tokens (id, user_token, phoneNumber, token, cookie, merchantId, created_at, date, status, Upiid, user_id) VALUES
(1, '3b5a65c28184fb285ab2751307c8908c', '7293959595', '4dac28e239f3467fa3e96305f1adeb60', 'eyJpdiI6IlhKeTQzdnBNUThZVnRuUlY2Y0Z0SXc9PSIsInZhbHVlIjoiTXRpTHMweWZQTU1YbjZtYWpIanA3djVxSFlNTGdicE9YTXd2TVFFMjlKME5ySTltXC9Nd3VxZjZsMEdpWXA3RkV3eTR4dFhubEhTUjF5YUZ3MW5pV2RzSEtYU1wvMmZLWUdnMGlnc2NZd1lmS244dDcyQUpPNHZFVjVaNXQyOHRBMyIsIm1hYyI6Ijk3ZWZiNzI5MjllYjExMjRkODFjZmJlMDBhYTgzNDRiMDg2NTE1ZWIxMzA0MDBmNDA4YjgwOGQwZTFjZWIxZGQifQ%3D%3D', '49354135', '2026-07-16 10:31:33', '2026-07-16 10:31:33', 'Active', 'BHARATPE.8S0S0J3C6E51057@fbpe', 1);

CREATE TABLE callback_report (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  request_url TEXT NOT NULL,
  response TEXT NOT NULL,
  user_token TEXT NOT NULL,
  mobile TEXT NOT NULL,
  name TEXT NOT NULL,
  date DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  user_token TEXT NOT NULL,
  status TEXT DEFAULT NULL,
  amount REAL NOT NULL,
  utr TEXT DEFAULT NULL,
  plan_id TEXT DEFAULT NULL,
  customer_name TEXT DEFAULT NULL,
  customer_mobile TEXT DEFAULT NULL,
  redirect_url TEXT DEFAULT NULL,
  remark1 TEXT DEFAULT NULL,
  remark2 TEXT DEFAULT NULL,
  gateway_txn TEXT DEFAULT NULL,
  method TEXT DEFAULT NULL,
  HDFC_TXNID TEXT DEFAULT NULL,
  upiLink TEXT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  byteTransactionId TEXT DEFAULT NULL,
  create_date DATETIME DEFAULT NULL,
  paytm_txn_ref TEXT DEFAULT NULL,
  user_id INTEGER DEFAULT NULL,
  webhook_sent TEXT NOT NULL DEFAULT 'no',
  payer_name TEXT DEFAULT NULL,
  payer_handle TEXT DEFAULT NULL
);

CREATE TABLE payment_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_token TEXT NOT NULL,
  order_id TEXT NOT NULL,
  payee_vpa TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transactionId TEXT DEFAULT NULL,
  status TEXT DEFAULT NULL,
  order_id TEXT DEFAULT NULL,
  vpa TEXT DEFAULT NULL,
  paymentApp TEXT DEFAULT NULL,
  amount TEXT DEFAULT NULL,
  user_token TEXT DEFAULT NULL,
  UTR TEXT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  date DATETIME DEFAULT CURRENT_TIMESTAMP,
  mobile TEXT DEFAULT NULL,
  user_name TEXT DEFAULT NULL,
  merchantTransactionId TEXT UNIQUE DEFAULT NULL,
  transactionNote TEXT DEFAULT NULL,
  user_id INTEGER DEFAULT NULL
);

CREATE TABLE settlement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userid INTEGER NOT NULL,
  amount REAL NOT NULL,
  utr_no TEXT NOT NULL,
  status INTEGER NOT NULL,
  remark TEXT DEFAULT NULL,
  date DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE site_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_name TEXT NOT NULL,
  logo_url TEXT NOT NULL,
  site_link TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  copyright_text TEXT NOT NULL
);

INSERT INTO site_settings (id, brand_name, logo_url, site_link, whatsapp_number, copyright_text) VALUES
(1, 'Temple Management', '/common/img/logo.png', 'https://pg.kaippullitemple.online/', '8907959595', 'Temple Management');

CREATE TABLE subscription_plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_name TEXT DEFAULT NULL,
  amount TEXT DEFAULT NULL,
  expiry TEXT DEFAULT NULL,
  status TEXT DEFAULT NULL,
  date DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO subscription_plan (id, plan_name, amount, expiry, status) VALUES
(1, 'Basic', '399', '1 ', 'active'),
(2, 'Starter', '699', '3 ', 'active'),
(3, 'Business', '949', '6 ', 'active'),
(4, 'Enterprise', '1999', '12 ', 'active');

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  password TEXT NOT NULL,
  is_otp TEXT DEFAULT NULL,
  otp TEXT DEFAULT NULL,
  otp_expiry DATETIME DEFAULT NULL,
  whatsapp_alert TEXT DEFAULT 'YES',
  email_alert TEXT DEFAULT NULL,
  email TEXT NOT NULL,
  company TEXT DEFAULT NULL,
  pin TEXT NOT NULL,
  pan TEXT NOT NULL,
  aadhaar TEXT NOT NULL,
  location TEXT NOT NULL,
  user_token TEXT NOT NULL,
  expiry DATE DEFAULT NULL,
  callback_url TEXT DEFAULT NULL,
  bptoken TEXT DEFAULT NULL,
  upiid TEXT DEFAULT NULL,
  acc_lock INTEGER NOT NULL DEFAULT 0,
  acc_ban TEXT NOT NULL DEFAULT 'off',
  upi_id TEXT DEFAULT NULL,
  phonepe_connected TEXT DEFAULT 'No',
  hdfc_connected TEXT DEFAULT 'No',
  paytm_connected TEXT DEFAULT 'No',
  bharatpe_connected TEXT DEFAULT 'No',
  googlepay_connected TEXT DEFAULT 'No',
  mobikwik_connected TEXT NOT NULL DEFAULT 'No',
  sbi_connected TEXT NOT NULL DEFAULT 'No',
  freecharge_connected TEXT NOT NULL DEFAULT 'No',
  amazonpay_connected TEXT DEFAULT 'No',
  instance_id TEXT DEFAULT NULL,
  instance_secret TEXT DEFAULT NULL,
  fixed_navbar TEXT DEFAULT NULL,
  fixed_layout TEXT DEFAULT NULL,
  sidebar_layout TEXT DEFAULT NULL,
  box_style TEXT DEFAULT NULL,
  theme_color TEXT DEFAULT NULL
);

INSERT INTO users (id, name, mobile, role, password, email, company, pin, pan, aadhaar, location, user_token, expiry, bharatpe_connected) VALUES
(1, 'Temple UPI Gateway', '7293959595', 'superadmin', '$2b$10$BpgMgGkW0ZUhBcLu.TQFnuIXuFejsdjijegCEZ1j5TB477bJehuZW', 'babuperumana@gmail.com', 'Temple UPI Gateway', '679326', 'FGHIU5432Q', '987654321021', 'Melattur, Kerala', '3b5a65c28184fb285ab2751307c8908c', '2034-10-01', 'Yes');

CREATE TABLE vazhipadu_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  ageing INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE vazhipadu_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  vazhipadu_name TEXT NOT NULL,
  devotee_name TEXT NOT NULL,
  nakshathram TEXT NOT NULL,
  performing_date TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_mode TEXT NOT NULL, -- 'UPI' or 'COUNTER'
  status TEXT DEFAULT 'PENDING',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE donations_payment_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_mode TEXT NOT NULL, -- 'UPI' or 'COUNTER'
  status TEXT DEFAULT 'PENDING',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  whatsapp_name TEXT,
  purpose TEXT -- 'Annadanam', 'Temple Renovation', 'Upcoming Events'
);

CREATE TABLE devotees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number TEXT NOT NULL UNIQUE,
  whatsapp_name TEXT,
  language TEXT, -- 'Malayalam', 'English', 'Tamil', 'Hindi'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Manually-managed special days (dates not covered by the panchangam engine).
CREATE TABLE special_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date TEXT NOT NULL, -- 'YYYY-MM-DD'
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE nakshathra_pooja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,             -- devotee / person the pooja is for
  nakshathram TEXT NOT NULL,      -- Malayalam nakshathram name (matches panchangam)
  whatsapp_number TEXT NOT NULL,  -- e.g. '918907959595'
  status TEXT DEFAULT 'ACTIVE',   -- 'ACTIVE' or 'INACTIVE'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tracks which daily reminder batches have run, so a restart never double-sends.
-- slot: 'evening' (5PM reminders) or 'morning' (8:30AM confirmations).
CREATE TABLE reminder_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL,             -- 'evening' | 'morning'
  run_date TEXT NOT NULL,         -- IST date 'YYYY-MM-DD' the batch covered
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(slot, run_date)
);

-- Atomic counter for order IDs (V/D/CV/CD). Survives restarts and never
-- produces duplicates, even with concurrent requests.
CREATE TABLE IF NOT EXISTS order_counters (
  type TEXT PRIMARY KEY,   -- 'V' | 'D' | 'CV' | 'CD'
  next_num INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO order_counters (type, next_num) VALUES ('V', 1), ('D', 1), ('CV', 1), ('CD', 1);
`;

db.exec(schema, (err) => {
  if (err) {
    console.error('Error executing schema:', err.message);
  } else {
    console.log('Database initialized successfully.');
  }
  db.close();
});
