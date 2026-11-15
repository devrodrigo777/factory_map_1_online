import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Tudo que o sistema grava fica em server/data (ou em DATA_DIR): banco + imagens.
// Para fazer backup basta copiar essa pasta.
export const DATA_DIR = process.env.DATA_DIR || path.resolve(here, '../data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'factory.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migrações versionadas via PRAGMA user_version. Para evoluir o banco
// (importação de Excel, métricas...) basta acrescentar novos itens ao final.
const migrations = [
  `
  CREATE TABLE maps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    image       TEXT    NOT NULL,
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    is_root     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE areas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id        INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    name          TEXT    NOT NULL DEFAULT '',
    code          TEXT    NOT NULL DEFAULT '',   -- chave para ligar a área a dados externos (Excel)
    description   TEXT    NOT NULL DEFAULT '',
    points        TEXT    NOT NULL,              -- JSON [[x,y],...] normalizado de 0 a 1
    color         TEXT    NOT NULL DEFAULT '#2B5C8F',
    opacity       REAL    NOT NULL DEFAULT 0.25,
    show_label    INTEGER NOT NULL DEFAULT 1,
    target_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
    sort_order    INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_areas_map ON areas(map_id);
  `,
  // 2: LOTO — campos livres, registros de bloqueio, importações, KPIs e cadeados nas áreas
  `
  ALTER TABLE areas ADD COLUMN lock_filter    TEXT    NOT NULL DEFAULT '';   -- expressão: quais registros pertencem à área
  ALTER TABLE areas ADD COLUMN show_lock      INTEGER NOT NULL DEFAULT 0;    -- mostra cadeado se houver bloqueio ativo
  ALTER TABLE areas ADD COLUMN display_fields TEXT    NOT NULL DEFAULT '[]'; -- chaves dos campos exibidos ao clicar

  CREATE TABLE fields (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key        TEXT    NOT NULL UNIQUE,
    label      TEXT    NOT NULL,
    type       TEXT    NOT NULL DEFAULT 'text',   -- text | number | date
    role       TEXT,                              -- locked_by | locked_at | unlocked_at | sector | equipment
    expr       TEXT    NOT NULL DEFAULT '',       -- preenchido = campo calculado
    visible    INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE imports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    filename      TEXT NOT NULL,
    sheet         TEXT NOT NULL DEFAULT '',
    rows_total    INTEGER NOT NULL DEFAULT 0,
    rows_imported INTEGER NOT NULL DEFAULT 0,
    rows_skipped  INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE records (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    data       TEXT NOT NULL,                    -- JSON { chave_do_campo: valor }
    hash       TEXT NOT NULL DEFAULT '',         -- evita duplicar linhas idênticas ao importar
    import_id  INTEGER REFERENCES imports(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_records_hash   ON records(hash);
  CREATE INDEX idx_records_import ON records(import_id);

  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE kpis (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    expr       TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  INSERT INTO fields (key, label, type, role, sort_order) VALUES
    ('equipamento',      'Equipamento',         'text',   'equipment',   1),
    ('setor',            'Setor',               'text',   'sector',      2),
    ('bloqueado_por',    'Quem bloqueou',       'text',   'locked_by',   3),
    ('data_bloqueio',    'Data de bloqueio',    'date',   'locked_at',   4),
    ('data_desbloqueio', 'Data de desbloqueio', 'date',   'unlocked_at', 5),
    ('motivo',           'Motivo',              'text',   NULL,          6),
    ('qtd_cadeados',     'Qtd. de cadeados',    'number', NULL,          7);
  `,
  // 3: login com perfis, sessões, auditoria, perfis de importação
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'viewer',   -- viewer | operator | admin
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);
  CREATE TABLE audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT NOT NULL DEFAULT (datetime('now')),
    user_name TEXT NOT NULL DEFAULT '',
    action    TEXT NOT NULL,
    detail    TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE import_profiles (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    mapping    TEXT NOT NULL,                 -- JSON [{ header, action, field|label|type }]
    options    TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ALTER TABLE records ADD COLUMN created_by TEXT NOT NULL DEFAULT '';
  ALTER TABLE records ADD COLUMN updated_by TEXT NOT NULL DEFAULT '';
  ALTER TABLE imports ADD COLUMN user_name  TEXT NOT NULL DEFAULT '';
  `,
  // 4: histórico de alterações dos registros e registro das tarefas automáticas
  `
  CREATE TABLE record_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL,
    at        TEXT NOT NULL DEFAULT (datetime('now')),
    user_name TEXT NOT NULL DEFAULT '',
    action    TEXT NOT NULL,                 -- create | update | unlock | delete | import
    summary   TEXT NOT NULL DEFAULT '',
    changes   TEXT NOT NULL DEFAULT '[]'     -- JSON [{ k, l, from, to }]
  );
  CREATE INDEX idx_history_record ON record_history(record_id);
  CREATE TABLE job_log (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    at      TEXT NOT NULL DEFAULT (datetime('now')),
    job     TEXT NOT NULL,                   -- backup | import
    status  TEXT NOT NULL,                   -- ok | warn | error
    message TEXT NOT NULL DEFAULT ''
  );
  `,
];

const current = db.pragma('user_version', { simple: true });
for (let i = current; i < migrations.length; i++) {
  db.transaction(() => {
    db.exec(migrations[i]);
    db.pragma(`user_version = ${i + 1}`);
  })();
}

export const getSetting = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? '';
export const setSetting = (k, v) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
