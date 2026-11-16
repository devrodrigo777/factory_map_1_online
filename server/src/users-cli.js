// Cria um usuário ou redefine a senha no VPS multi-tenant.
// Uso: npm run user -- <login> <senha> [globaladmin|admin|operator|viewer] [company_slug_ou_id]
import { masterDb } from './db.js';
import { hashPassword, ROLES } from './auth.js';

const [username, password, role = 'admin', companyArg] = process.argv.slice(2);
if (!username || !password || password.length < 8 || !ROLES.includes(role)) {
  console.log('Uso: npm run user -- <login> <senha com 8+ caracteres> [globaladmin|admin|operator|viewer] [company_slug_ou_id]');
  process.exit(1);
}
const login = username.trim().toLowerCase();
const hash = hashPassword(password);

let companyId = null;
if (role !== 'globaladmin') {
  if (companyArg) {
    const comp = masterDb.prepare('SELECT id FROM companies WHERE slug = ? OR id = ?').get(companyArg, Number(companyArg) || 0);
    if (!comp) {
      console.error(`Empresa "${companyArg}" não encontrada.`);
      process.exit(1);
    }
    companyId = comp.id;
  } else {
    const firstComp = masterDb.prepare('SELECT id FROM companies ORDER BY id ASC LIMIT 1').get();
    companyId = firstComp?.id || null;
  }
}

const cur = masterDb.prepare('SELECT id FROM users WHERE username = ?').get(login);
if (cur) {
  masterDb.prepare('UPDATE users SET password_hash = ?, role = ?, company_id = ?, active = 1 WHERE id = ?').run(hash, role, companyId, cur.id);
  masterDb.prepare('DELETE FROM sessions WHERE user_id = ?').run(cur.id);
  console.log(`Senha de "${login}" redefinida (perfil: ${role}, empresa ID: ${companyId || 'Global'}).`);
} else {
  masterDb.prepare('INSERT INTO users (username, name, password_hash, role, company_id) VALUES (?, ?, ?, ?, ?)')
    .run(login, login, hash, role, companyId);
  console.log(`Usuário "${login}" criado (perfil: ${role}, empresa ID: ${companyId || 'Global'}).`);
}
