import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

const APP_DATA_DIR =
  process.env.INVOICES_DB_DIR ??
  join(
    process.env.HOME ?? "~",
    "Library",
    "Application Support",
    "com.michalhonc.invoices"
  );

if (!existsSync(APP_DATA_DIR)) {
  mkdirSync(APP_DATA_DIR, { recursive: true });
}

const DB_PATH = join(APP_DATA_DIR, "invoices.db");

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    _db = new Database(DB_PATH, { create: true });
    _db.exec("PRAGMA journal_mode = WAL;");
    _db.exec("PRAGMA foreign_keys = ON;");
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL CHECK(file_type IN ('pdf','jpg','jpeg','png','isdoc','xml','csv')),
      month TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('incoming','outgoing')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoice_data (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      cislo_faktury TEXT,
      datum_vystaveni TEXT,
      duzp TEXT,
      dppd TEXT,
      dodavatel_nazev TEXT,
      dodavatel_ico TEXT,
      dodavatel_dic TEXT,
      odberatel_nazev TEXT,
      odberatel_ico TEXT,
      odberatel_dic TEXT,
      zaklad_dane_1 REAL DEFAULT 0,
      dan_1 REAL DEFAULT 0,
      zaklad_dane_2 REAL DEFAULT 0,
      dan_2 REAL DEFAULT 0,
      zaklad_dane_3 REAL DEFAULT 0,
      dan_3 REAL DEFAULT 0,
      celkem REAL DEFAULT 0,
      mena TEXT DEFAULT 'CZK',
      kod_pred_pl TEXT,
      kod_rezim_pl TEXT DEFAULT '0',
      zdph_44 TEXT DEFAULT 'N',
      pomer TEXT DEFAULT 'N',
      kh_section TEXT CHECK(kh_section IN ('A1','A2','A3','A4','A5','B1','B2','B3') OR kh_section IS NULL),
      ocr_confidence REAL,
      manually_verified INTEGER DEFAULT 0,
      raw_ocr_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kh_submissions (
      id TEXT PRIMARY KEY,
      rok INTEGER NOT NULL,
      mesic INTEGER NOT NULL,
      typ TEXT NOT NULL CHECK(typ IN ('B','O','N','E')),
      xml_content TEXT,
      xml_path TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','generated','submitted')),
      generated_at TEXT,
      submitted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_month ON invoices(month);
    CREATE INDEX IF NOT EXISTS idx_invoices_direction ON invoices(direction);
    CREATE INDEX IF NOT EXISTS idx_invoice_data_invoice_id ON invoice_data(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_kh_submissions_period ON kh_submissions(rok, mesic);
  `);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
