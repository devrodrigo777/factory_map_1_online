// Configurações do sistema + tarefas automáticas: backup agendado e importação por pasta monitorada.
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, masterDb, getTenantDb, tenantContext, getSetting, setSetting } from './db.js';
import { DEFAULT_CONFIG, getConfig, saveConfig } from './core.js';
import { norm } from './expr.js';
import { BACKUP_DIR, runBackup } from './backup.js';
import { importRows, listProfiles, profileToMapping, readSheet } from './loto.js';
import { audit, onLogin } from './auth.js';

export const router = Router();
const httpError = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- estado e registro das tarefas ----------
const getState = (job) => { try { return JSON.parse(getSetting(`job_${job}`) || '{}'); } catch { return {}; } };
const setState = (job, patch) => setSetting(`job_${job}`, JSON.stringify({ ...getState(job), ...patch }));
function log(job, status, message) {
  const id = db.prepare('INSERT INTO job_log (job, status, message) VALUES (?, ?, ?)').run(job, status, message).lastInsertRowid;
  if (id % 100 === 0) db.prepare('DELETE FROM job_log WHERE id < ?').run(id - 500);
}
const running = { backup: false, import: false };

// ---------- backup automático ----------
export function nextBackupAt(cfg, st) {
  if (!cfg.enabled) return null;
  const now = Date.now();
  const last = st.last_run ? Date.parse(st.last_run) : 0;
  if (cfg.mode === 'every') return new Date(Math.max(now, last + cfg.every_hours * 3600000)).toISOString();
  const [h, m] = cfg.time.split(':').map(Number);
  const t = new Date(now);
  t.setHours(h, m, 0, 0);
  if (last >= t.getTime() || (now > t.getTime() && last >= t.getTime())) t.setDate(t.getDate() + 1);
  return t.toISOString();
}

function backupDue(cfg, st) {
  if (!cfg.enabled) return false;
  const now = Date.now();
  const last = st.last_run ? Date.parse(st.last_run) : 0;
  if (st.last_ok === false && now - last > 30 * 60000) return true; // falhou: tenta de novo em 30 min
  if (cfg.mode === 'every') return now - last >= cfg.every_hours * 3600000;
  const [h, m] = cfg.time.split(':').map(Number);
  const sched = new Date(now);
  sched.setHours(h, m, 0, 0);
  return now >= sched.getTime() && last < sched.getTime();
}

export async function runBackupJob() {
  if (running.backup) return getState('backup');
  running.backup = true;
  const at = new Date().toISOString();
  try {
    const c = getConfig().backup;
    const maxKeep = Math.min(5, Math.max(1, c.keep || 5));
    const out = await runBackup({ type: c.type, includeUsers: c.include_users, prefix: 'auto', keep: maxKeep, copyTo: '' });
    const msg = `${out.name} (${Math.round(out.size / 1024)} KB)`;
    setState('backup', { last_run: at, last_ok: true, last_message: msg, last_file: out.name });
    log('backup', 'ok', msg);
  } catch (e) {
    setState('backup', { last_run: at, last_ok: false, last_message: e.message });
    log('backup', 'error', e.message);
  } finally {
    running.backup = false;
  }
  return getState('backup');
}

// ---------- importação automática ----------
function archive(full, name, cfg, sub) {
  if (sub === 'importados' && cfg.after === 'delete') { fs.unlinkSync(full); return; }
  const dir = path.join(cfg.folder, sub);
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  fs.renameSync(full, path.join(dir, `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${name}`));
}

async function importOne(full, name, cfg, summary) {
  summary.files++;
  try {
    const { headers, rows, sheet } = await readSheet(fs.readFileSync(full));
    const profiles = listProfiles();
    let profile;
    if (cfg.profile_id) {
      profile = profiles.find((p) => p.id === Number(cfg.profile_id));
      if (!profile) throw new Error('O perfil de importação configurado não existe mais.');
    } else {
      profile = profiles.map((p) => ({ p, s: profileToMapping(p, headers).score })).sort((a, b) => b.s - a.s)[0]?.p;
      if (!profile) throw new Error('Não há perfil de importação salvo. Salve um perfil na tela “Importar Excel”.');
    }
    const m = profileToMapping(profile, headers);
    if (m.score < cfg.min_match) {
      throw new Error(`As colunas do arquivo combinam só ${Math.round(m.score * 100)}% com o perfil “${profile.name}” (mínimo ${Math.round(cfg.min_match * 100)}%).`);
    }
    const r = importRows({
      headers, rows, sheet, mapping: m.mapping, filename: name,
      skipDuplicates: profile.options?.skipDuplicates !== false,
      filterExpr: profile.options?.filterEnabled ? profile.options.filterExpr || '' : '',
      userName: 'importação automática',
    });
    archive(full, name, cfg, 'importados');
    const warn = [m.unknown.length ? `colunas ignoradas (não estão no perfil): ${m.unknown.join(', ')}` : '', m.missing.length ? `colunas do perfil ausentes no arquivo: ${m.missing.join(', ')}` : ''].filter(Boolean).join('; ');
    log('import', warn ? 'warn' : 'ok', `${name}: ${r.imported} registros adicionados, ${r.skipped_duplicates} repetidos ignorados (perfil “${profile.name}”)${warn ? ` — ${warn}` : ''}`);
    summary.ok++;
  } catch (e) {
    summary.error++;
    try { archive(full, name, cfg, 'erros'); } catch { /* sem permissão para mover */ }
    log('import', 'error', `${name}: ${e.message} Arquivo movido para a subpasta “erros”.`);
  }
}

export async function runImportJob(isManual = false) {
  const cfg = getConfig().import;
  if (!isManual && !cfg.enabled) {
    return { files: 0, ok: 0, error: 0, disabled: true };
  }
  if (running.import) return { files: 0, ok: 0, error: 0, busy: true };
  running.import = true;
  const summary = { files: 0, ok: 0, error: 0 };
  const at = new Date().toISOString();
  try {
    if (!cfg.folder) throw new Error('Pasta de importação não configurada.');
    if (!fs.existsSync(cfg.folder) || !fs.statSync(cfg.folder).isDirectory()) throw new Error(`Pasta não encontrada: ${cfg.folder}`);
    const names = fs.readdirSync(cfg.folder).filter((n) => /\.(xlsx|xlsm)$/i.test(n) && !n.startsWith('~$')).sort();
    for (const name of names) {
      const full = path.join(cfg.folder, name);
      const st = fs.statSync(full);
      if (!st.isFile() || Date.now() - st.mtimeMs < 10000) continue; // ainda sendo copiado: espera
      await importOne(full, name, cfg, summary);
    }
    if (summary.files) setState('import', { last_run: at, last_ok: summary.error === 0, last_message: `${summary.ok} arquivo(s) importado(s), ${summary.error} com erro` });
    else setState('import', { last_check: at, last_error: null });
  } catch (e) {
    setState('import', { last_run: at, last_ok: false, last_message: e.message });
    if (getState('import').last_logged_error !== e.message) { log('import', 'error', e.message); setState('import', { last_logged_error: e.message }); }
  } finally {
    running.import = false;
  }
  return summary;
}

let lastImportTick = 0;
export function startJobs() {
  const tick = async () => {
    try {
      const companies = masterDb.prepare('SELECT id FROM companies WHERE active = 1').all();
      for (const comp of companies) {
        const tDb = getTenantDb(comp.id);
        if (!tDb) continue;
        await tenantContext.run({ companyId: comp.id, db: tDb }, async () => {
          try {
            const cfg = getConfig();
            if (backupDue(cfg.backup, getState('backup'))) await runBackupJob();
          } catch (err) {
            console.error(`Falha em tarefa da empresa ${comp.id}:`, err.message);
          }
        });
      }
    } catch (e) { console.error('Falha em tarefa automática:', e.message); }
  };
  setTimeout(tick, 15000).unref();
  setInterval(tick, 15000).unref();
}

onLogin(async () => {
  try {
    const cfg = getConfig();
    if (cfg.import.enabled && cfg.import.check_on_login && cfg.import.folder) {
      await runImportJob(false);
    }
  } catch (e) {
    console.error('Falha ao verificar importação no login:', e.message);
  }
});

// ---------- rotas de configuração ----------
const clampNum = (v, a, b, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(Math.max(n, a), b) : def; };

function checkFolder(dir, { write }) {
  try {
    if (!fs.existsSync(dir)) return write ? (fs.mkdirSync(dir, { recursive: true }), checkFolder(dir, { write })) : 'A pasta não existe.';
    if (!fs.statSync(dir).isDirectory()) return 'O caminho informado não é uma pasta.';
    fs.accessSync(dir, fs.constants.R_OK);
    if (write) {
      const probe = path.join(dir, `.teste-${Date.now()}`);
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
    }
    return null;
  } catch (e) {
    return `Sem acesso à pasta: ${e.message}`;
  }
}

function cleanConfig(b) {
  const cur = getConfig();
  const out = { ...cur };
  if ('lock_stages' in b) {
    if (!Array.isArray(b.lock_stages) || !b.lock_stages.length || b.lock_stages.length > 8) throw httpError(400, 'Defina de 1 a 8 faixas de cor.');
    out.lock_stages = b.lock_stages
      .map((s) => ({
        min_hours: clampNum(s.min_hours, 0, 100000, 0),
        color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#2B5C8F',
        label: String(s.label ?? '').trim().slice(0, 30) || `Faixa`,
      }))
      .sort((a, b) => a.min_hours - b.min_hours);
    out.lock_stages[0].min_hours = 0; // a primeira faixa cobre os bloqueios mais novos
  }
  if ('recurrence_days' in b) out.recurrence_days = clampNum(b.recurrence_days, 1, 365, 7);
  if (b.nav_effects) {
    const x = b.nav_effects;
    out.nav_effects = {
      touch_zoom: x.touch_zoom !== undefined ? !!x.touch_zoom : true,
      touch_zoom_percent: Math.round(clampNum(x.touch_zoom_percent, 10, 200, 100)),
      presentation_button: x.presentation_button !== undefined ? !!x.presentation_button : true,
      presentation_time_seconds: Math.round(clampNum(x.presentation_time_seconds, 2, 600, 10)),
      presentation_zoom: x.presentation_zoom !== undefined ? !!x.presentation_zoom : true,
      presentation_zoom_percent: Math.round(clampNum(x.presentation_zoom_percent, 10, 200, 100)),
    };
  }
  if (b.backup) {
    const x = b.backup;
    const c = {
      enabled: !!x.enabled,
      mode: x.mode === 'every' ? 'every' : 'daily',
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time) ? x.time : '02:00',
      every_hours: clampNum(x.every_hours, 1, 168, 6),
      type: x.type === 'data' ? 'data' : 'full',
      include_users: !!x.include_users,
      keep: Math.round(clampNum(x.keep, 1, 5, 5)),
      copy_to: '',
    };
    out.backup = c;
  }
  if (b.import) {
    const x = b.import;
    const c = {
      enabled: !!x.enabled,
      folder: String(x.folder ?? '').trim(),
      interval_s: Math.round(clampNum(x.interval_s, 10, 3600, 60)),
      profile_id: x.profile_id ? Number(x.profile_id) : null,
      after: x.after === 'delete' ? 'delete' : 'move',
      min_match: clampNum(x.min_match, 0.3, 1, 0.6),
      check_on_login: !!x.check_on_login,
    };
    if (c.enabled && !c.folder) throw httpError(400, 'Informe a pasta de importação para ligar a importação automática.');
    if (c.folder) { const err = checkFolder(c.folder, { write: true }); if (err) throw httpError(400, `Pasta de importação: ${err}`); }
    if (c.profile_id && !listProfiles().some((p) => p.id === c.profile_id)) throw httpError(400, 'O perfil de importação escolhido não existe.');
    out.import = c;
  }
  return out;
}

const statusPayload = () => {
  const cfg = getConfig();
  const bs = getState('backup');
  return {
    backup: { ...bs, next_at: nextBackupAt(cfg.backup, bs), running: running.backup },
    import: { ...getState('import'), running: running.import },
    logs: db.prepare('SELECT * FROM job_log ORDER BY id DESC LIMIT 50').all(),
  };
};

router.get('/config', (_req, res) => res.json({ config: getConfig(), defaults: DEFAULT_CONFIG, ...statusPayload(), profiles: listProfiles().map((p) => ({ id: p.id, name: p.name })) }));

router.put('/config', (req, res) => {
  saveConfig(cleanConfig(req.body));
  res.json({ config: getConfig(), ...statusPayload() });
});

router.post('/config/test-folder', (req, res) => {
  const dir = String(req.body.path ?? '').trim();
  if (!dir) throw httpError(400, 'Informe a pasta.');
  const err = checkFolder(dir, { write: !!req.body.write });
  res.json({ ok: !err, error: err });
});

router.get('/jobs/status', (_req, res) => res.json(statusPayload()));

router.post('/jobs/backup/run', wrap(async (req, res) => {
  await runBackupJob();
  audit(req.user?.username, 'Executou o backup automático manualmente');
  res.json(statusPayload());
}));

router.post('/jobs/import/run', wrap(async (req, res) => {
  const summary = await runImportJob(true);
  audit(req.user?.username, 'Executou a importação automática manualmente');
  res.json({ summary, ...statusPayload() });
}));

export { norm, BACKUP_DIR };
