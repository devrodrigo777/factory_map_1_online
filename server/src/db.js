import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.DATA_DIR || path.resolve(here, '../data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const TENANTS_DIR = path.join(DATA_DIR, 'tenants');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(TENANTS_DIR, { recursive: true });

export const masterDb = new Database(path.join(DATA_DIR, 'master.db'));
masterDb.pragma('journal_mode = WAL');
masterDb.pragma('foreign_keys = ON');

// Schema do banco mestre (gerenciamento global de empresas, usuários e sessões)
masterDb.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    slug       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'viewer',  -- globaladmin | admin | operator | viewer
    company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash        TEXT PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    active_company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    expires_at        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS global_audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT NOT NULL DEFAULT (datetime('now')),
    user_name TEXT NOT NULL DEFAULT '',
    action    TEXT NOT NULL,
    detail    TEXT NOT NULL DEFAULT ''
  );
`);

// Migrações do banco de cada empresa (armazenamento estritamente isolado)
const tenantMigrations = [
  `
  CREATE TABLE IF NOT EXISTS maps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    image       TEXT    NOT NULL,
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    is_root     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS areas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id        INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    name          TEXT    NOT NULL DEFAULT '',
    code          TEXT    NOT NULL DEFAULT '',
    description   TEXT    NOT NULL DEFAULT '',
    points        TEXT    NOT NULL,
    color         TEXT    NOT NULL DEFAULT '#2B5C8F',
    opacity       REAL    NOT NULL DEFAULT 0.25,
    show_label    INTEGER NOT NULL DEFAULT 1,
    target_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    lock_filter   TEXT    NOT NULL DEFAULT '',
    show_lock     INTEGER NOT NULL DEFAULT 0,
    display_fields TEXT   NOT NULL DEFAULT '[]'
  );
  CREATE INDEX IF NOT EXISTS idx_areas_map ON areas(map_id);

  CREATE TABLE IF NOT EXISTS fields (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key        TEXT    NOT NULL UNIQUE,
    label      TEXT    NOT NULL,
    type       TEXT    NOT NULL DEFAULT 'text',
    role       TEXT,
    expr       TEXT    NOT NULL DEFAULT '',
    visible    INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS imports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    filename      TEXT NOT NULL,
    sheet         TEXT NOT NULL DEFAULT '',
    rows_total    INTEGER NOT NULL DEFAULT 0,
    rows_imported INTEGER NOT NULL DEFAULT 0,
    rows_skipped  INTEGER NOT NULL DEFAULT 0,
    user_name     TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS records (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    data       TEXT NOT NULL,
    hash       TEXT NOT NULL DEFAULT '',
    import_id  INTEGER REFERENCES imports(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL DEFAULT '',
    updated_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_records_hash   ON records(hash);
  CREATE INDEX IF NOT EXISTS idx_records_import ON records(import_id);

  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS kpis (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    expr       TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT NOT NULL DEFAULT (datetime('now')),
    user_name TEXT NOT NULL DEFAULT '',
    action    TEXT NOT NULL,
    detail    TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS import_profiles (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    mapping    TEXT NOT NULL,
    options    TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS record_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL,
    at        TEXT NOT NULL DEFAULT (datetime('now')),
    user_name TEXT NOT NULL DEFAULT '',
    action    TEXT NOT NULL,
    summary   TEXT NOT NULL DEFAULT '',
    changes   TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX IF NOT EXISTS idx_history_record ON record_history(record_id);

  CREATE TABLE IF NOT EXISTS job_log (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    at      TEXT NOT NULL DEFAULT (datetime('now')),
    job     TEXT NOT NULL,
    status  TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT ''
  );
  `
];

function migrateTenantDb(tDb) {
  tDb.exec(tenantMigrations[0]);
  const fCount = tDb.prepare('SELECT COUNT(*) AS c FROM fields').get().c;
  if (fCount === 0) {
    tDb.prepare(`
      INSERT INTO fields (key, label, type, role, sort_order) VALUES
        ('equipamento',      'Equipamento',         'text',   'equipment',   1),
        ('setor',            'Setor',               'text',   'sector',      2),
        ('bloqueado_por',    'Quem bloqueou',       'text',   'locked_by',   3),
        ('data_bloqueio',    'Data de bloqueio',    'date',   'locked_at',   4),
        ('data_desbloqueio', 'Data de desbloqueio', 'date',   'unlocked_at', 5),
        ('motivo',           'Motivo',              'text',   NULL,          6),
        ('qtd_cadeados',     'Qtd. de cadeados',    'number', NULL,          7);
    `).run();
  }
}

// Pool de conexões por tenant em memória
const tenantDbs = new Map();

export function getTenantDb(companyId) {
  const cid = Number(companyId);
  if (!cid || Number.isNaN(cid)) return null;
  let tDb = tenantDbs.get(cid);
  if (!tDb) {
    const tenantDir = path.join(TENANTS_DIR, String(cid));
    fs.mkdirSync(tenantDir, { recursive: true });
    fs.mkdirSync(path.join(tenantDir, 'backups'), { recursive: true });
    tDb = new Database(path.join(tenantDir, 'factory.db'));
    tDb.pragma('journal_mode = WAL');
    tDb.pragma('foreign_keys = ON');
    migrateTenantDb(tDb);
    tenantDbs.set(cid, tDb);
  }
  return tDb;
}

export function closeTenantDb(companyId) {
  const cid = Number(companyId);
  const tDb = tenantDbs.get(cid);
  if (tDb) {
    try { tDb.close(); } catch {}
    tenantDbs.delete(cid);
  }
}

// Contexto assíncrono para identificar a empresa da requisição atual
export const tenantContext = new AsyncLocalStorage();

export function getDb() {
  const store = tenantContext.getStore();
  if (store?.db) return store.db;
  const first = masterDb.prepare('SELECT id FROM companies WHERE active = 1 ORDER BY id ASC LIMIT 1').get();
  if (first) return getTenantDb(first.id);
  // Se ainda não há empresas cadastradas, retorna um banco de fallback em memória para não quebrar inicializações
  let fallback = tenantDbs.get(0);
  if (!fallback) {
    fallback = new Database(':memory:');
    migrateTenantDb(fallback);
    tenantDbs.set(0, fallback);
  }
  return fallback;
}

export const db = new Proxy({}, {
  get(_target, prop) {
    const target = getDb();
    const val = target[prop];
    return typeof val === 'function' ? val.bind(target) : val;
  }
});

export const getSetting = (k) => getDb().prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? '';
export const setSetting = (k, v) =>
  getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);

// Criação programática de empresa
export function createTenantCompany({ name, slug }) {
  const s = String(slug || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const n = String(name || '').trim();
  const id = masterDb.prepare('INSERT INTO companies (name, slug) VALUES (?, ?)').run(n, s).lastInsertRowid;
  getTenantDb(id); // inicializa e roda migrações do tenant
  return { id, name: n, slug: s, active: 1 };
}

// Migração de banco legado de versão anterior sem multi-tenant (se existir data/factory.db)
function checkLegacyMigration() {
  const legacyDbPath = path.join(DATA_DIR, 'factory.db');
  const companyCount = masterDb.prepare('SELECT COUNT(*) AS c FROM companies').get().c;
  if (companyCount === 0 && fs.existsSync(legacyDbPath)) {
    try {
      console.log('Migrando banco legado factory.db para multi-tenant (Empresa Matriz)...');
      const id = masterDb.prepare('INSERT INTO companies (id, name, slug) VALUES (1, ?, ?)').run('Empresa Matriz', 'matriz').lastInsertRowid;
      const tenantDir = path.join(TENANTS_DIR, String(id));
      fs.mkdirSync(tenantDir, { recursive: true });
      fs.copyFileSync(legacyDbPath, path.join(tenantDir, 'factory.db'));

      // Copia usuários do legado para o master
      const legDb = new Database(legacyDbPath);
      const legUsers = legDb.prepare('SELECT * FROM users').all();
      let firstAdmin = true;
      for (const u of legUsers) {
        const role = (firstAdmin && u.role === 'admin') ? 'globaladmin' : u.role;
        masterDb.prepare('INSERT OR IGNORE INTO users (username, name, password_hash, role, company_id, active) VALUES (?, ?, ?, ?, ?, ?)')
          .run(u.username, u.name, u.password_hash, role, id, u.active);
        firstAdmin = false;
      }
      legDb.close();
      console.log('Migração multi-tenant concluída com sucesso!');
    } catch (e) {
      console.error('Erro na migração legado:', e);
    }
  }
}
checkLegacyMigration();
