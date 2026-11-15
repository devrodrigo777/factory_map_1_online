// Login, sessões, perfis de acesso, usuários e registro de atividades.
// Sem dependências externas: senhas com scrypt, sessão por cookie httpOnly.
import { Router } from 'express';
import crypto from 'node:crypto';
import { db, getSetting, setSetting } from './db.js';
import { generateCaptcha, verifyCaptcha } from './captcha.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

export const ROLES = ['viewer', 'operator', 'admin'];
const LEVEL = { viewer: 1, operator: 2, admin: 3 };
const SESSION_MS = 14 * 24 * 3600 * 1000;

const loginHooks = [];
export const onLogin = (fn) => loginHooks.push(fn);

// ---------- senhas e sessões ----------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64).toString('base64')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const parseCookies = (h = '') => Object.fromEntries(h.split(';').map((s) => s.trim()).filter(Boolean).map((p) => {
  const i = p.indexOf('=');
  return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
}));

export function userFromRequest(req) {
  const token = parseCookies(req.headers.cookie).sid;
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.username, u.name, u.role, s.expires_at FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.active = 1`).get(sha(token));
  if (!row) return null;
  const now = Date.now();
  if (row.expires_at < now) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
    return null;
  }
  if (row.expires_at - now < SESSION_MS - 86400000) {
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(now + SESSION_MS, sha(token)); // renova 1x/dia
  }
  const { expires_at, ...user } = row;
  return user;
}

function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha(token), userId, Date.now() + SESSION_MS);
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`);
}

// ---------- auditoria ----------
export function audit(userName, action, detail = '') {
  const id = db.prepare('INSERT INTO audit_log (user_name, action, detail) VALUES (?, ?, ?)').run(userName || '', action, detail).lastInsertRowid;
  if (id % 500 === 0) db.prepare('DELETE FROM audit_log WHERE id < ?').run(id - 5000);
}

const LABELS = [
  [/^POST \/records\/delete-many$/, 'Excluiu registros em massa'],
  [/^POST \/records$/, 'Criou registro'],
  [/^PUT \/records\/(\d+)$/, 'Editou registro #$1'],
  [/^DELETE \/records\/(\d+)$/, 'Excluiu registro #$1'],
  [/^POST \/import$/, 'Importou planilha'],
  [/^DELETE \/imports\/(\d+)$/, 'Desfez importação #$1'],
  [/^\w+ \/import-profiles/, 'Alterou perfil de importação'],
  [/^PUT \/maps\/(\d+)\/areas$/, 'Salvou as áreas da planta #$1'],
  [/^POST \/maps$/, 'Enviou imagem de planta'],
  [/^\w+ \/maps\/(\d+)/, 'Alterou a planta #$1'],
  [/^\w+ \/fields/, 'Alterou campos'],
  [/^\w+ \/kpis/, 'Alterou KPIs'],
  [/^PUT \/settings/, 'Alterou a definição de bloqueio ativo'],
  [/^\w+ \/users/, 'Alterou usuários'],
  [/^PUT \/config/, 'Alterou as configurações do sistema'],
  [/^POST \/backup\/create/, 'Criou backup'],
  [/^DELETE \/backup/, 'Excluiu backup'],
];
const SKIP_AUDIT = /^(POST \/config\/test-folder|POST \/jobs|POST \/backup\/restore|POST \/import\/preview|POST \/expr\/test|POST \/backup\/inspect|PUT \/fields\/order)/;

function auditOnFinish(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const key = `${req.method} ${req.path}`;
  if (SKIP_AUDIT.test(key)) return;
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const hit = LABELS.find(([re]) => re.test(key));
    audit(req.user?.username, hit ? key.replace(hit[0], hit[1]) : key, '');
  });
}

// ---------- quem pode o quê ----------
const READ_PUBLIC = [/^\/maps(\/|$)/, /^\/areas\/\d+\/(records|history)$/];

function required(req) {
  const p = req.path;
  const read = req.method === 'GET' || req.method === 'HEAD';
  if (p === '/health' || p.startsWith('/auth/')) return 'public';
  if (/^\/(users|backup|expr|audit|config|jobs)(\/|$)/.test(p)) return 'admin';
  if (p.startsWith('/export')) return 'operator';
  if (/^\/(reports|history)(\/|$)/.test(p)) return 'viewer';
  if (/^\/(records|import|imports|import-profiles)(\/|$)/.test(p)) return read ? 'viewer' : 'operator';
  if (/^\/(maps|areas|fields|kpis|settings|stats)(\/|$)/.test(p)) return read ? 'viewer' : 'admin';
  return 'admin';
}

export const publicViewOn = () => getSetting('public_view') === '1';
const userCount = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

export function guard(req, res, next) {
  req.user = userFromRequest(req);
  const need = required(req);
  if (need === 'public') return next();
  if (!req.user) {
    const publicRead = req.method === 'GET' && READ_PUBLIC.some((re) => re.test(req.path));
    if (publicRead && publicViewOn() && userCount() > 0) return next();
    return next(httpError(401, 'Faça login para continuar.'));
  }
  if (LEVEL[req.user.role] < LEVEL[need]) return next(httpError(403, 'Seu perfil não tem permissão para esta ação.'));
  auditOnFinish(req, res);
  next();
}

// protege as imagens (/uploads) com a mesma regra da leitura do mapa
export function uploadsGuard(req, res, next) {
  if (userFromRequest(req) || (publicViewOn() && userCount() > 0)) return next();
  res.status(401).end();
}

// ---------- rotas ----------
export const router = Router();

const attempts = new Map(); // limite de tentativas de login
function throttle(key) {
  const a = attempts.get(key);
  if (a && a.until > Date.now()) throw httpError(429, `Muitas tentativas. Aguarde ${Math.ceil((a.until - Date.now()) / 1000)} s.`);
}
function fail(key) {
  const a = attempts.get(key) ?? { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= 5) { a.until = Date.now() + Math.min(300, 30 * 2 ** (a.n - 5)) * 1000; }
  attempts.set(key, a);
}

function cleanUser(b, { creating }) {
  const out = {};
  if (creating || 'username' in b) {
    const u = String(b.username ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(u)) throw httpError(400, 'Usuário: 3 a 32 caracteres (letras, números, ponto, hífen ou sublinhado).');
    out.username = u;
  }
  if (creating || 'name' in b) {
    const n = String(b.name ?? '').trim().slice(0, 80);
    if (!n) throw httpError(400, 'Informe o nome da pessoa.');
    out.name = n;
  }
  if (creating || 'role' in b) {
    if (!ROLES.includes(b.role)) throw httpError(400, 'Perfil inválido.');
    out.role = b.role;
  }
  if ('active' in b) out.active = b.active ? 1 : 0;
  if (creating || b.password) {
    const pw = String(b.password ?? '');
    if (pw.length < 8 || pw.length > 200) throw httpError(400, 'A senha precisa ter pelo menos 8 caracteres.');
    out.password_hash = hashPassword(pw);
  }
  return out;
}

const userOut = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role });

router.get('/auth/config', (req, res) => {
  const username = String(req.query.username ?? '').trim().toLowerCase();
  const key = `${req.ip}|${username}`;
  const needCaptcha = (attempts.get(key)?.n ?? 0) >= 3;
  res.json({ setup_needed: userCount() === 0, public_view: publicViewOn(), captcha_required: needCaptcha });
});
router.get('/auth/captcha', (_req, res) => res.json(generateCaptcha()));
router.get('/auth/me', (req, res) => res.json({ user: req.user ? userOut(req.user) : null }));

// Primeiro acesso: cria o administrador (só funciona enquanto não existe nenhum usuário).
router.post('/auth/setup', (req, res) => {
  if (userCount() > 0) throw httpError(409, 'O sistema já foi configurado.');
  const u = cleanUser({ ...req.body, role: 'admin' }, { creating: true });
  const id = db.prepare('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)').run(u.username, u.name, u.password_hash, 'admin').lastInsertRowid;
  startSession(req, res, id);
  audit(u.username, 'Criou o administrador inicial');
  res.status(201).json({ user: userOut({ id, ...u, role: 'admin' }) });
});

router.post('/auth/login', (req, res) => {
  const username = String(req.body.username ?? '').trim().toLowerCase();
  const key = `${req.ip}|${username}`;
  throttle(key);

  const prevAttempts = attempts.get(key)?.n ?? 0;
  if (prevAttempts >= 3) {
    const { captcha, captcha_token } = req.body;
    if (!captcha || !captcha_token) {
      throw Object.assign(new Error('Digite o código de verificação para continuar.'), { status: 400, captcha_required: true });
    }
    if (!verifyCaptcha(captcha, captcha_token)) {
      fail(key);
      audit(username, 'Tentativa de login com captcha incorreto');
      throw Object.assign(new Error('Código de verificação incorreto ou expirado.'), { status: 400, captcha_required: true });
    }
  }

  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!u || !u.active || !verifyPassword(String(req.body.password ?? ''), u.password_hash)) {
    fail(key);
    audit(username, 'Tentativa de login recusada');
    const curAttempts = attempts.get(key)?.n ?? 0;
    throw Object.assign(new Error('Usuário ou senha incorretos.'), { status: 401, captcha_required: curAttempts >= 3 });
  }
  attempts.delete(key);
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(u.id);
  startSession(req, res, u.id);
  audit(u.username, 'Entrou no sistema');
  loginHooks.forEach((fn) => { try { fn(u); } catch (e) { console.error('Erro em hook de login:', e); } });
  res.json({ user: userOut(u) });
});

router.post('/auth/logout', (req, res) => {
  const t = parseCookies(req.headers.cookie).sid;
  if (t) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(t));
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.status(204).end();
});

router.post('/auth/password', (req, res) => {
  if (!req.user) throw httpError(401, 'Faça login para continuar.');
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(req.body.current ?? ''), u.password_hash)) throw httpError(400, 'A senha atual está incorreta.');
  const { password_hash } = cleanUser({ password: req.body.next }, { creating: false });
  if (!password_hash) throw httpError(400, 'A senha precisa ter pelo menos 8 caracteres.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, u.id);
  const t = parseCookies(req.headers.cookie).sid;
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(u.id, sha(t ?? ''));
  audit(u.username, 'Alterou a própria senha');
  res.status(204).end();
});

// ----- administração de usuários -----
const adminsAfter = (id, patch) =>
  db.prepare('SELECT id, role, active FROM users').all().map((u) => (u.id === id ? { ...u, ...patch } : u)).filter((u) => u.role === 'admin' && u.active).length;

router.get('/users', (_req, res) =>
  res.json(db.prepare('SELECT id, username, name, role, active, created_at, last_login_at FROM users ORDER BY name COLLATE NOCASE').all().map((u) => ({ ...u, active: !!u.active }))));

router.put('/users/public-view', (req, res) => {
  setSetting('public_view', req.body.enabled ? '1' : '0');
  res.json({ public_view: !!req.body.enabled });
});

router.post('/users', (req, res) => {
  const u = cleanUser(req.body, { creating: true });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(u.username)) throw httpError(409, 'Já existe um usuário com esse login.');
  const id = db.prepare('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)').run(u.username, u.name, u.password_hash, u.role).lastInsertRowid;
  res.status(201).json({ id });
});

router.patch('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!cur) throw httpError(404, 'Usuário não encontrado.');
  const body = { ...req.body };
  delete body.username; // o login não muda
  const u = cleanUser(body, { creating: false });
  if (('role' in u || 'active' in u) && adminsAfter(id, { role: u.role ?? cur.role, active: u.active ?? cur.active }) < 1) {
    throw httpError(400, 'É preciso manter pelo menos um administrador ativo.');
  }
  const next = { ...cur, ...u };
  db.prepare('UPDATE users SET name = ?, role = ?, active = ?, password_hash = ? WHERE id = ?').run(next.name, next.role, next.active, next.password_hash, id);
  if (u.password_hash || u.active === 0) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) throw httpError(404, 'Usuário não encontrado.');
  if (adminsAfter(id, { role: 'deleted', active: 0 }) < 1) throw httpError(400, 'É preciso manter pelo menos um administrador ativo.');
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.status(204).end();
});

router.get('/audit', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 10), 1000);
  res.json(db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit));
});
