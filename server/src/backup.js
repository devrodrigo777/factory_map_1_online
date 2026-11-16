// Backup e restauração (.zip), exportação para Excel.
//  - "data": só os registros de bloqueio (+ histórico de importações)
//  - "full": dados + configurações (plantas, imagens, áreas, campos, KPIs, perfis de importação, ajustes)
//            e, opcionalmente, usuários (com hashes de senha).
// O agendamento automático fica em jobs.js.
import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { zip as fzip, unzip as funzip, strToU8, strFromU8 } from 'fflate';
import fs from 'node:fs';
import path from 'node:path';
import { db, masterDb, tenantContext, DATA_DIR, UPLOAD_DIR } from './db.js';
import { getStore, invalidate, isActive, valuesFor } from './store.js';
import { audit } from './auth.js';

export const router = Router();
const httpError = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const getBackupDir = () => {
  const cid = tenantContext.getStore()?.companyId || 1;
  const dir = path.join(DATA_DIR, 'tenants', String(cid), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const NAME_RE = /^[\w.-]+\.zip$/;
const SCHEMA = () => db.pragma('user_version', { simple: true });

const FULL_TABLES = ['maps', 'areas', 'fields', 'imports', 'records', 'kpis', 'settings', 'import_profiles'];
const DELETE_ORDER = ['records', 'imports', 'areas', 'maps', 'fields', 'kpis', 'settings', 'import_profiles'];
const INSERT_ORDER = ['maps', 'areas', 'fields', 'imports', 'records', 'kpis', 'settings', 'import_profiles'];

// zip/unzip assíncronos (em outra thread): um backup grande não trava o sistema
const zipP = (files) => new Promise((ok, no) => fzip(files, { level: 6 }, (e, d) => (e ? no(e) : ok(d))));
const unzipP = (data) => new Promise((ok, no) => funzip(data, { filter: (f) => f.originalSize < 600 * 1024 * 1024 }, (e, d) => (e ? no(e) : ok(d))));

const rows = (t) => db.prepare(`SELECT * FROM ${t}`).all();
const pad = (n) => String(n).padStart(2, '0');
export const stamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// ---------- criação ----------
export async function buildBackup(type, { includeUsers = false } = {}) {
  const files = {};
  const data = {};
  if (type === 'full') {
    for (const t of FULL_TABLES) data[t] = rows(t);
    if (includeUsers) {
      const cid = tenantContext.getStore()?.companyId;
      data.users = cid
        ? masterDb.prepare('SELECT username, name, password_hash, role, active FROM users WHERE company_id = ?').all(cid)
        : masterDb.prepare('SELECT username, name, password_hash, role, active FROM users').all();
    }
    for (const m of data.maps) {
      const f = path.basename(m.image);
      try {
        files[`uploads/${f}`] = [new Uint8Array(fs.readFileSync(path.join(UPLOAD_DIR, f))), { level: f.endsWith('.svg') ? 6 : 0 }];
      } catch { /* imagem ausente: segue sem ela */ }
    }
  } else {
    data.fields_ref = db.prepare("SELECT key, label, type FROM fields WHERE expr = ''").all();
    data.imports = rows('imports');
    data.records = rows('records');
  }
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  const manifest = {
    app: 'factory-map', format: 1, schema: SCHEMA(), type,
    created_at: new Date().toISOString(), includes_users: !!data.users, counts,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  files['data.json'] = strToU8(JSON.stringify(data));
  return { buffer: Buffer.from(await zipP(files)), manifest };
}

function prune(dir, prefix, keep) {
  fs.readdirSync(dir)
    .filter((n) => n.startsWith(`${prefix}-`) && NAME_RE.test(n))
    .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(keep)
    .forEach((x) => fs.unlinkSync(path.join(dir, x.n)));
}

/** Cria o backup no servidor; opcionalmente guarda só os últimos `keep` e copia para outra pasta. */
export async function runBackup({ type = 'full', includeUsers = false, prefix = 'loto', keep = 0, copyTo = '' } = {}) {
  const { buffer, manifest } = await buildBackup(type, { includeUsers });
  const backupDir = getBackupDir();
  let name = `${prefix}-${type}-${stamp()}.zip`;
  for (let n = 2; fs.existsSync(path.join(backupDir, name)); n++) name = `${prefix}-${type}-${stamp()}-${n}.zip`;
  fs.writeFileSync(path.join(backupDir, name), buffer);
  if (keep > 0) prune(backupDir, prefix, keep);
  let copyError = null;
  if (copyTo) {
    try {
      fs.mkdirSync(copyTo, { recursive: true });
      fs.writeFileSync(path.join(copyTo, name), buffer);
      if (keep > 0) prune(copyTo, prefix, keep);
    } catch (e) { copyError = e.message; }
  }
  return { name, size: buffer.length, manifest, copyError };
}

function listBackups() {
  const backupDir = getBackupDir();
  return fs.readdirSync(backupDir).filter((n) => NAME_RE.test(n)).map((name) => {
    const st = fs.statSync(path.join(backupDir, name));
    return {
      name, size: st.size, created_at: st.mtime.toISOString(),
      type: name.includes('-full-') ? 'full' : 'data',
      auto: name.startsWith('auto-'),
    };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---------- leitura / validação ----------
async function readBackup(buffer) {
  let files;
  try { files = await unzipP(new Uint8Array(buffer)); } catch { throw httpError(400, 'O arquivo não é um backup válido (.zip corrompido).'); }
  if (!files['manifest.json'] || !files['data.json']) throw httpError(400, 'O arquivo não parece um backup deste sistema.');
  let manifest, data;
  try { manifest = JSON.parse(strFromU8(files['manifest.json'])); data = JSON.parse(strFromU8(files['data.json'])); } catch { throw httpError(400, 'Backup corrompido.'); }
  if (manifest.app !== 'factory-map' || !['data', 'full'].includes(manifest.type)) throw httpError(400, 'O arquivo não parece um backup deste sistema.');
  if (manifest.schema > SCHEMA()) throw httpError(400, 'Este backup foi feito por uma versão mais nova do sistema. Atualize o sistema antes de restaurar.');
  return { files, manifest, data };
}

function loadInput(req) {
  if (req.file) return req.file.buffer;
  const name = String(req.body?.name ?? '');
  const backupDir = getBackupDir();
  if (!NAME_RE.test(name) || !fs.existsSync(path.join(backupDir, name))) throw httpError(404, 'Backup não encontrado.');
  return fs.readFileSync(path.join(backupDir, name));
}

// ---------- restauração ----------
const insertCache = new Map();
function insertRows(table, list) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  for (const r of list) {
    const ks = cols.filter((c) => c in r);
    if (!ks.length) continue;
    const sql = `INSERT INTO ${table} (${ks.map((k) => `"${k}"`).join(',')}) VALUES (${ks.map(() => '?').join(',')})`;
    if (!insertCache.has(sql)) insertCache.set(sql, db.prepare(sql));
    insertCache.get(sql).run(ks.map((k) => r[k]));
  }
}

function restoreFull({ files, data }) {
  if (data.users && !data.users.some((u) => (u.role === 'admin' || u.role === 'globaladmin') && u.active)) {
    throw httpError(400, 'O backup contém usuários, mas nenhum administrador ativo. Restauração cancelada para você não perder o acesso.');
  }
  const cid = tenantContext.getStore()?.companyId || 1;
  db.transaction(() => {
    for (const t of DELETE_ORDER) if (t in data) db.prepare(`DELETE FROM ${t}`).run();
    for (const t of INSERT_ORDER) if (t in data) insertRows(t, data[t]);
    if (data.users) {
      masterDb.prepare('DELETE FROM users WHERE company_id = ?').run(cid);
      for (const u of data.users) {
        masterDb.prepare('INSERT INTO users (username, name, password_hash, role, company_id, active) VALUES (?, ?, ?, ?, ?, ?)')
          .run(u.username, u.name, u.password_hash, u.role === 'globaladmin' ? 'admin' : (u.role || 'viewer'), cid, u.active ?? 1);
      }
    }
  })();
  const keep = new Set();
  for (const m of data.maps ?? []) keep.add(path.basename(m.image));
  for (const [name, bytes] of Object.entries(files)) {
    if (!name.startsWith('uploads/')) continue;
    const base = path.basename(name);
    if (/^[\w.-]+$/.test(base)) fs.writeFileSync(path.join(UPLOAD_DIR, base), bytes);
  }
  if (data.maps) for (const f of fs.readdirSync(UPLOAD_DIR)) if (!keep.has(f)) fs.unlinkSync(path.join(UPLOAD_DIR, f));
}

function restoreData({ data }, mode, userName) {
  db.transaction(() => {
    const have = new Set(db.prepare('SELECT key FROM fields').all().map((f) => f.key));
    const labels = new Set(db.prepare('SELECT label FROM fields').all().map((f) => f.label.toLowerCase()));
    for (const f of data.fields_ref ?? []) {
      if (have.has(f.key)) continue;
      const label = labels.has(String(f.label).toLowerCase()) ? `${f.label} (backup)` : f.label;
      const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM fields').get().n;
      db.prepare('INSERT INTO fields (key, label, type, sort_order) VALUES (?, ?, ?, ?)').run(f.key, label, f.type, order);
    }
    if (mode === 'replace') {
      db.prepare('DELETE FROM records').run();
      db.prepare('DELETE FROM imports').run();
      insertRows('imports', data.imports ?? []);
      insertRows('records', data.records ?? []);
    } else {
      const seen = new Set(db.prepare("SELECT hash FROM records WHERE hash != ''").all().map((r) => r.hash));
      const importId = db.prepare('INSERT INTO imports (filename, sheet, user_name) VALUES (?, ?, ?)').run('Restauração de backup', '', userName || '').lastInsertRowid;
      const ins = db.prepare('INSERT INTO records (data, hash, import_id, created_by) VALUES (?, ?, ?, ?)');
      let n = 0;
      for (const r of data.records ?? []) {
        if (r.hash && seen.has(r.hash)) continue;
        seen.add(r.hash);
        ins.run(r.data, r.hash ?? '', importId, r.created_by ?? '');
        n++;
      }
      db.prepare('UPDATE imports SET rows_total = ?, rows_imported = ? WHERE id = ?').run(data.records?.length ?? 0, n, importId);
    }
  })();
}

// ---------- rotas ----------
const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 600 * 1024 * 1024 },
  fileFilter: (_r, f, cb) => (/\.zip$/i.test(f.originalname) ? cb(null, true) : cb(httpError(400, 'Envie um arquivo de backup .zip.'))),
});

router.get('/backup/list', (_req, res) => res.json(listBackups()));

router.post('/backup/create', wrap(async (req, res) => {
  const type = req.body.type === 'full' ? 'full' : 'data';
  const out = await runBackup({ type, includeUsers: type === 'full' && !!req.body.include_users });
  res.status(201).json({ name: out.name, size: out.size, manifest: out.manifest });
}));

router.get('/backup/files/:name', (req, res) => {
  const name = req.params.name;
  const backupDir = getBackupDir();
  if (!NAME_RE.test(name) || !fs.existsSync(path.join(backupDir, name))) throw httpError(404, 'Backup não encontrado.');
  res.download(path.join(backupDir, name), name);
});

router.delete('/backup/files/:name', (req, res) => {
  const name = req.params.name;
  const backupDir = getBackupDir();
  if (!NAME_RE.test(name)) throw httpError(400, 'Nome inválido.');
  try { fs.unlinkSync(path.join(backupDir, name)); } catch { /* já não existe */ }
  res.status(204).end();
});

router.post('/backup/inspect', zipUpload.single('file'), wrap(async (req, res) => {
  const { manifest, files } = await readBackup(loadInput(req));
  res.json({ manifest, images: Object.keys(files).filter((f) => f.startsWith('uploads/')).length });
}));

router.post('/backup/restore', zipUpload.single('file'), wrap(async (req, res) => {
  const backup = await readBackup(loadInput(req));
  const mode = req.body.mode === 'append' ? 'append' : 'replace';
  // rede de segurança: backup completo do estado atual antes de qualquer alteração
  const safety = await runBackup({ type: 'full', includeUsers: true, prefix: 'antes-restauracao', keep: 5 });
  if (backup.manifest.type === 'full') restoreFull(backup);
  else restoreData(backup, mode, req.user?.username);
  invalidate();
  audit(req.user?.username, `Restaurou backup (${backup.manifest.type}${backup.manifest.type === 'data' ? `, ${mode}` : ''})`, safety.name);
  res.json({ ok: true, type: backup.manifest.type, safety_backup: safety.name, relogin: !!backup.data.users });
}));

// ---------- exportar registros para Excel (em streaming: não pesa com 100 mil+ linhas) ----------
const isoToExcel = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(v ?? ''));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0))) : v;
};

router.get('/export/records.xlsx', wrap(async (_req, res) => {
  const st = getStore();
  const { fields } = st.ctx;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="registros-loto-${stamp().slice(0, 8)}.xlsx"`);
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
  const ws = wb.addWorksheet('Registros', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    ...fields.map((f) => ({ key: f.key, width: Math.max(14, f.label.length + 4), style: f.type === 'date' ? { numFmt: 'dd/mm/yyyy hh:mm' } : {} })),
    { key: '_estado', width: 12 },
  ];
  const head = ws.addRow([...fields.map((f) => f.label), 'Estado']);
  head.font = { bold: true };
  head.commit();
  for (const rec of st.recs) {
    const v = valuesFor(st, rec);
    ws.addRow([...fields.map((f) => (f.type === 'date' ? isoToExcel(v[f.key]) : v[f.key] ?? null)), isActive(st, rec) ? 'Ativo' : 'Encerrado']).commit();
  }
  await ws.commit();
  await wb.commit();
}));

// ---------- Área de Risco: Exclusão de dados / ambiente / backups ----------
router.post('/account/clear-data', wrap(async (req, res) => {
  const confirmation = String(req.body?.confirmation ?? '').trim();
  if (confirmation !== 'EXCLUIR DADOS') {
    throw httpError(400, 'Confirmação incorreta. Digite exatamente "EXCLUIR DADOS".');
  }
  db.transaction(() => {
    db.prepare('DELETE FROM records').run();
    db.prepare('DELETE FROM record_history').run();
    db.prepare('DELETE FROM imports').run();
  })();
  invalidate();
  audit(req.user?.username, 'Excluiu todos os registros e histórico de importações (Área de Risco)');
  res.json({ ok: true, message: 'Todos os registros e histórico foram excluídos com sucesso.' });
}));

router.post('/account/clear-environment', wrap(async (req, res) => {
  const confirmation = String(req.body?.confirmation ?? '').trim();
  if (confirmation !== 'EXCLUIR TUDO') {
    throw httpError(400, 'Confirmação incorreta. Digite exatamente "EXCLUIR TUDO".');
  }
  // Coleta imagens das plantas do tenant atual antes de limpar
  const mapImages = db.prepare('SELECT image FROM maps').all().map((m) => path.basename(m.image));

  db.transaction(() => {
    db.prepare('DELETE FROM records').run();
    db.prepare('DELETE FROM record_history').run();
    db.prepare('DELETE FROM imports').run();
    db.prepare('DELETE FROM areas').run();
    db.prepare('DELETE FROM maps').run();
    db.prepare('DELETE FROM kpis').run();
    db.prepare('DELETE FROM settings').run();
    db.prepare('DELETE FROM import_profiles').run();
    db.prepare('DELETE FROM fields').run();
    db.prepare(`
      INSERT INTO fields (key, label, type, role, sort_order) VALUES
        ('equipamento',      'Equipamento',         'text',   'equipment',   1),
        ('setor',            'Setor',               'text',   'sector',      2),
        ('bloqueado_por',    'Quem bloqueou',       'text',   'locked_by',   3),
        ('data_bloqueio',    'Data de bloqueio',    'date',   'locked_at',   4),
        ('data_desbloqueio', 'Data de desbloqueio', 'date',   'unlocked_at', 5),
        ('motivo',           'Motivo',              'text',   NULL,          6),
        ('qtd_cadeados',     'Qtd. de cadeados',    'number', NULL,          7);
    `).run();
  })();

  // Remove imagens de plantas associadas
  for (const f of mapImages) {
    if (f && /^[\w.-]+$/.test(f)) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, f)); } catch {}
    }
  }

  invalidate();
  audit(req.user?.username, 'Excluiu dados e configurações do ambiente (Área de Risco)');
  res.json({ ok: true, message: 'Dados e configurações foram limpos com sucesso. Usuários preservados.' });
}));

router.post('/account/clear-backups', wrap(async (req, res) => {
  const confirmation = String(req.body?.confirmation ?? '').trim();
  if (confirmation !== 'EXCLUIR BACKUPS') {
    throw httpError(400, 'Confirmação incorreta. Digite exatamente "EXCLUIR BACKUPS".');
  }
  const backupDir = getBackupDir();
  let count = 0;
  if (fs.existsSync(backupDir)) {
    for (const f of fs.readdirSync(backupDir)) {
      if (NAME_RE.test(f)) {
        try {
          fs.unlinkSync(path.join(backupDir, f));
          count++;
        } catch {}
      }
    }
  }
  audit(req.user?.username, `Excluiu ${count} arquivo(s) de backup local (Área de Risco)`);
  res.json({ ok: true, count, message: `${count} backup(s) excluído(s) com sucesso.` });
}));
