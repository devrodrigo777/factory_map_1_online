// Cria um usuário ou redefine a senha (útil se esquecerem a senha do administrador).
// Uso: npm run user -- <login> <senha> [admin|operator|viewer]
import { db } from './db.js';
import { hashPassword, ROLES } from './auth.js';

const [username, password, role = 'admin'] = process.argv.slice(2);
if (!username || !password || password.length < 8 || !ROLES.includes(role)) {
  console.log('Uso: npm run user -- <login> <senha com 8+ caracteres> [admin|operator|viewer]');
  process.exit(1);
}
const login = username.trim().toLowerCase();
const hash = hashPassword(password);
const cur = db.prepare('SELECT id FROM users WHERE username = ?').get(login);
if (cur) {
  db.prepare('UPDATE users SET password_hash = ?, role = ?, active = 1 WHERE id = ?').run(hash, role, cur.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(cur.id);
  console.log(`Senha de "${login}" redefinida (perfil: ${role}).`);
} else {
  db.prepare('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)').run(login, login, hash, role);
  console.log(`Usuário "${login}" criado (perfil: ${role}).`);
}
