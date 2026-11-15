import { Router } from 'express';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, UPLOAD_DIR } from './db.js';
import { runBackup } from './backup.js';
import { audit, verifyPassword } from './auth.js';
import { invalidate } from './store.js';

export const router = Router();
const httpError = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Sessões temporárias para transferência via link / QR Code (válidas por 1 hora)
const syncSessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of syncSessions.entries()) {
    if (now - s.createdAt > 3600000) syncSessions.delete(id);
  }
}, 60000).unref();

const insertCache = new Map();
function insertRows(table, list) {
  if (!Array.isArray(list) || !list.length) return;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  for (const r of list) {
    const ks = cols.filter((c) => c in r);
    if (!ks.length) continue;
    const sql = `INSERT INTO ${table} (${ks.map((k) => `"${k}"`).join(',')}) VALUES (${ks.map(() => '?').join(',')})`;
    if (!insertCache.has(sql)) insertCache.set(sql, db.prepare(sql));
    insertCache.get(sql).run(ks.map((k) => r[k]));
  }
}

/**
 * Monta o pacote de dados para sincronização (data ou full)
 */
function buildSyncPayload(type, adminUsername) {
  const records = db.prepare('SELECT * FROM records').all();
  const imports = db.prepare('SELECT * FROM imports').all();
  const record_history = db.prepare('SELECT * FROM record_history').all();

  const payload = {
    records,
    imports,
    record_history,
    fields_ref: db.prepare("SELECT key, label, type FROM fields WHERE expr = ''").all(),
  };

  const counts = {
    records: records.length,
    imports: imports.length,
    record_history: record_history.length,
  };

  if (type === 'full') {
    payload.maps = db.prepare('SELECT * FROM maps').all();
    payload.areas = db.prepare('SELECT * FROM areas').all();
    payload.fields = db.prepare('SELECT * FROM fields').all();
    payload.kpis = db.prepare('SELECT * FROM kpis').all();
    payload.import_profiles = db.prepare('SELECT * FROM import_profiles').all();
    payload.settings = db.prepare('SELECT * FROM settings').all();

    // Coleta imagens associadas aos mapas
    payload.images = {};
    for (const m of payload.maps) {
      if (m.image && m.image.startsWith('/uploads/')) {
        const basename = path.basename(m.image);
        const fullPath = path.join(UPLOAD_DIR, basename);
        if (fs.existsSync(fullPath)) {
          payload.images[basename] = fs.readFileSync(fullPath).toString('base64');
        }
      }
    }

    counts.maps = payload.maps.length;
    counts.areas = payload.areas.length;
    counts.fields = payload.fields.length;
    counts.kpis = payload.kpis.length;
    counts.images = Object.keys(payload.images).length;
    counts.settings = payload.settings.length;
  }

  const manifest = {
    v: 1,
    type,
    created_at: new Date().toISOString(),
    created_by: adminUsername,
    counts,
  };

  return { manifest, data: payload };
}

/**
 * Gera código de sincronização comprimido em base64url
 */
router.post('/sync/export', wrap(async (req, res) => {
  const type = req.body?.type === 'data' ? 'data' : 'full';
  const username = req.user?.username || 'admin';
  const { manifest, data } = buildSyncPayload(type, username);

  const jsonStr = JSON.stringify(data);
  const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'), { level: 9 });

  const manifestB64 = Buffer.from(JSON.stringify(manifest), 'utf8').toString('base64url');
  const payloadB64 = compressed.toString('base64url');
  const code = `FMSYNC1.${manifestB64}.${payloadB64}`;

  const sessionId = crypto.randomBytes(16).toString('hex');
  syncSessions.set(sessionId, { code, manifest, createdAt: Date.now() });

  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3001';
  const directUrl = `${proto}://${host}/api/sync/session/${sessionId}`;

  audit(username, `Gerou código de sincronização (${type === 'data' ? 'Somente dados' : 'Dados + configurações'})`);

  res.json({
    code,
    sessionId,
    directUrl,
    manifest,
    sizeBytes: code.length,
    rawBytes: jsonStr.length,
    compressedBytes: compressed.length,
  });
}));

/**
 * Consulta uma sessão de sincronização temporária
 */
router.get('/sync/session/:id', (req, res) => {
  const session = syncSessions.get(req.params.id);
  if (!session) throw httpError(404, 'Sessão de sincronização não encontrada ou expirada.');
  res.json({ code: session.code, manifest: session.manifest });
});

/**
 * Aplica um pacote de sincronização recebido (com validação de senha de administrador)
 */
router.post('/sync/apply', wrap(async (req, res) => {
  const { code: rawCode, password, mode = 'replace' } = req.body;
  if (!password) throw httpError(400, 'Informe sua senha de administrador para autorizar a sincronização.');
  if (!rawCode || typeof rawCode !== 'string') throw httpError(400, 'Código de sincronização não fornecido.');

  // Confirma a senha do usuário logado
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!u || !verifyPassword(password, u.password_hash)) {
    audit(req.user.username, 'Tentativa de sincronização com senha incorreta');
    throw httpError(401, 'Senha de confirmação incorreta. Digite sua senha de administrador.');
  }

  let code = rawCode.trim();

  // Se o código for um link ou sessionId, recupera o código real
  if (code.startsWith('http://') || code.startsWith('https://')) {
    const match = code.match(/\/session\/([a-f0-9]+)/i);
    if (match && syncSessions.has(match[1])) {
      code = syncSessions.get(match[1]).code;
    }
  } else if (syncSessions.has(code)) {
    code = syncSessions.get(code).code;
  }

  if (!code.startsWith('FMSYNC1.')) {
    throw httpError(400, 'Código de sincronização inválido ou corrompido.');
  }

  const parts = code.split('.');
  if (parts.length !== 3) throw httpError(400, 'Formato do código de sincronização inválido.');

  let manifest, payload;
  try {
    const manifestJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    manifest = JSON.parse(manifestJson);
    const compressed = Buffer.from(parts[2], 'base64url');
    const decompressed = zlib.gunzipSync(compressed);
    payload = JSON.parse(decompressed.toString('utf8'));
  } catch (err) {
    throw httpError(400, `Falha ao decodificar pacote de sincronização: ${err.message}`);
  }

  // Cria backup de segurança antes de aplicar a sincronização
  try {
    await runBackup({ type: 'full', includeUsers: true, prefix: 'pre-sync', keep: 14 });
  } catch (err) {
    console.error('Aviso: falha ao criar backup de segurança pré-sincronia:', err.message);
  }

  const isFull = manifest.type === 'full';

  db.transaction(() => {
    if (isFull) {
      // 1. Limpa tabelas na ordem de dependência
      const fullTables = ['records', 'record_history', 'imports', 'areas', 'maps', 'fields', 'kpis', 'settings', 'import_profiles'];
      for (const t of fullTables) {
        db.prepare(`DELETE FROM ${t}`).run();
      }

      // 2. Restaura Configurações
      if (Array.isArray(payload.settings)) {
        insertRows('settings', payload.settings);
      } else if (payload.settings && typeof payload.settings === 'object') {
        const sRows = Object.entries(payload.settings).map(([key, value]) => ({
          key,
          value: typeof value === 'string' ? value : JSON.stringify(value),
        }));
        insertRows('settings', sRows);
      }

      // 3. Restaura Campos
      if (Array.isArray(payload.fields)) {
        insertRows('fields', payload.fields);
      }

      // 4. Restaura KPIs
      if (Array.isArray(payload.kpis)) {
        insertRows('kpis', payload.kpis);
      }

      // 5. Restaura Perfis de Importação
      if (Array.isArray(payload.import_profiles)) {
        insertRows('import_profiles', payload.import_profiles);
      }

      // 6. Restaura Plantas e Áreas
      if (Array.isArray(payload.maps)) {
        insertRows('maps', payload.maps);
      }
      if (Array.isArray(payload.areas)) {
        insertRows('areas', payload.areas);
      }

      // 7. Restaura Imagens em disco
      if (payload.images && typeof payload.images === 'object') {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        for (const [filename, base64Data] of Object.entries(payload.images)) {
          const fullPath = path.join(UPLOAD_DIR, filename);
          fs.writeFileSync(fullPath, Buffer.from(base64Data, 'base64'));
        }
      }
    }

    if (!isFull && Array.isArray(payload.fields_ref)) {
      const have = new Set(db.prepare('SELECT key FROM fields').all().map((f) => f.key));
      const labels = new Set(db.prepare('SELECT label FROM fields').all().map((f) => f.label.toLowerCase()));
      for (const f of payload.fields_ref) {
        if (have.has(f.key)) continue;
        const label = labels.has(String(f.label).toLowerCase()) ? `${f.label} (backup)` : f.label;
        const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM fields').get().n;
        db.prepare('INSERT INTO fields (key, label, type, sort_order) VALUES (?, ?, ?, ?)').run(f.key, label, f.type, order);
      }
    }

    // Restaura Registros, Histórico e Importações
    if (isFull || mode === 'replace') {
      db.prepare('DELETE FROM records').run();
      db.prepare('DELETE FROM record_history').run();
      db.prepare('DELETE FROM imports').run();
      insertRows('imports', payload.imports || []);
      insertRows('records', payload.records || []);
      insertRows('record_history', payload.record_history || []);
    } else {
      // Append mode: insere os registros que não colidirem por hash
      const hasHash = db.prepare("SELECT 1 FROM records WHERE hash = ? AND hash != ''");
      const cols = db.prepare('PRAGMA table_info(records)').all().map((c) => c.name);
      for (const r of payload.records || []) {
        if (!r.hash || !hasHash.get(r.hash)) {
          const ks = cols.filter((c) => c in r && c !== 'id');
          const sql = `INSERT INTO records (${ks.map((k) => `"${k}"`).join(',')}) VALUES (${ks.map(() => '?').join(',')})`;
          db.prepare(sql).run(ks.map((k) => r[k]));
        }
      }
      insertRows('imports', payload.imports || []);
      insertRows('record_history', payload.record_history || []);
    }
  })();

  invalidate();
  audit(req.user.username, `Concluiu sincronização de dados (${isFull ? 'Dados + Configurações' : `Somente dados - ${mode}`})`);

  res.json({
    ok: true,
    manifest,
    appliedCounts: {
      records: db.prepare('SELECT COUNT(*) as c FROM records').get().c,
      maps: db.prepare('SELECT COUNT(*) as c FROM maps').get().c,
    },
  });
}));
