// Cria uma planta de exemplo (com imagem de detalhe) para testar o sistema.
// Uso: npm run seed   (use "npm run seed -- --force" para apagar os dados existentes antes)
import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOAD_DIR } from './db.js';
import { hashValues } from './core.js';

const force = process.argv.includes('--force');
const existing = db.prepare('SELECT COUNT(*) AS n FROM maps').get().n;
if (existing && !force) {
  console.log('O banco já possui plantas. Use "npm run seed -- --force" para recriar o exemplo.');
  process.exit(0);
}
if (force) {
  for (const m of db.prepare('SELECT image FROM maps').all()) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(m.image))); } catch { /* ok */ }
  }
  db.exec('DELETE FROM areas; DELETE FROM maps; DELETE FROM records; DELETE FROM imports; DELETE FROM kpis; DELETE FROM fields WHERE expr != \'\'; DELETE FROM sqlite_sequence WHERE name != \'fields\';');
}

const INK = '#31445A';
const font = 'font-family="Segoe UI,Arial,sans-serif"';
const svgWrap = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#E3E8ED" stroke-width="1"/></pattern></defs>
<rect width="${w}" height="${h}" fill="#F8F9FB"/><rect width="${w}" height="${h}" fill="url(#g)"/>${body}</svg>`;
const label = (x, y, t, size = 28) => `<text x="${x}" y="${y}" ${font} font-size="${size}" font-weight="700" fill="${INK}">${t}</text>`;
const box = (x, y, w, h, fill, stroke = INK, sw = 4, rx = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const rectPts = (x, y, w, h, W, H) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([a, b]) => [a / W, b / H]);

// ---------- planta geral ----------
const W = 1600, H = 1000;
const rooms = [
  { name: 'Recebimento', code: 'REC', x: 60, y: 80, w: 360, h: 360, fill: '#DCE8F2', color: '#2B5C8F', desc: 'Docas de descarga, conferência de notas e inspeção de matéria-prima.' },
  { name: 'Produção', code: 'PRD', x: 460, y: 80, w: 680, h: 540, fill: '#E6EFE3', color: '#2E8B6B', desc: 'Linha principal de produção. Clique para ver o detalhe das máquinas.', detail: true },
  { name: 'Estoque', code: 'EST', x: 1180, y: 80, w: 360, h: 360, fill: '#F3EBD8', color: '#B8860B', desc: 'Armazenagem de matéria-prima e produto acabado em porta-paletes.' },
  { name: 'Expedição', code: 'EXP', x: 1180, y: 480, w: 360, h: 440, fill: '#F2E0DA', color: '#E4572E', desc: 'Separação, carregamento e liberação de cargas.' },
  { name: 'Manutenção', code: 'MAN', x: 60, y: 480, w: 360, h: 440, fill: '#E8E1F0', color: '#7B4FA3', desc: 'Oficina, ferramentaria e almoxarifado técnico.' },
  { name: 'Escritório', code: 'ESC', x: 460, y: 660, w: 680, h: 260, fill: '#E9ECEF', color: '#5A6978', desc: 'Administração, PCP e sala de reunião.' },
];
let plan = '';
for (const r of rooms) plan += box(r.x, r.y, r.w, r.h, r.fill) + label(r.x + 20, r.y + 44, r.name);
for (let i = 0; i < 3; i++) plan += box(52, 150 + i * 90, 16, 60, '#E4572E', INK, 2);                    // docas recebimento
for (let i = 0; i < 4; i++) plan += box(1532, 560 + i * 90, 16, 60, '#E4572E', INK, 2);                 // docas expedição
for (let i = 0; i < 5; i++) plan += box(1210, 130 + i * 55, 300, 28, '#fff', INK, 2);                   // prateleiras
for (let i = 0; i < 6; i++) plan += box(500 + i * 105, 160 + (i % 2) * 20, 80, 90, '#fff', INK, 3, 6);  // máquinas
plan += `<path d="M500 380H1100" stroke="${INK}" stroke-width="10" stroke-dasharray="26 14" fill="none"/>`;
for (let i = 0; i < 4; i++) plan += box(500 + i * 150, 460, 120, 110, '#fff', INK, 3, 6);
for (let c = 0; c < 4; c++) for (let r = 0; r < 2; r++) plan += box(500 + c * 160, 720 + r * 90, 110, 50, '#fff', INK, 2, 4);
for (let i = 0; i < 3; i++) plan += box(100 + i * 110, 560 + (i % 2) * 120, 90, 60, '#fff', INK, 2, 4);
plan += box(10, 10, W - 20, H - 20, 'none', INK, 8);

// ---------- detalhe da produção ----------
const W2 = 1360, H2 = 1080;
const machines = [
  { name: 'Corte a laser', code: 'PRD-01', x: 80, y: 160, w: 360, h: 260, desc: 'Corte de chapas até 3 mm. Alimentação automática.' },
  { name: 'Dobra CNC', code: 'PRD-02', x: 500, y: 160, w: 360, h: 260, desc: 'Prensa dobradeira com 6 eixos.' },
  { name: 'Solda robotizada', code: 'PRD-03', x: 920, y: 160, w: 360, h: 260, desc: 'Célula com 2 robôs MIG/MAG.' },
  { name: 'Pintura', code: 'PRD-04', x: 80, y: 650, w: 360, h: 290, desc: 'Cabine de pintura eletrostática e estufa de cura.' },
  { name: 'Montagem', code: 'PRD-05', x: 500, y: 650, w: 360, h: 290, desc: 'Bancadas de montagem final.' },
  { name: 'Inspeção final', code: 'PRD-06', x: 920, y: 650, w: 360, h: 290, desc: 'Metrologia e liberação de qualidade.' },
];
let detail = box(30, 30, W2 - 60, H2 - 60, 'none', INK, 8) + label(80, 110, 'Produção · Linha 1', 40);
detail += `<path d="M260 430V520H1100V430M260 520V640M680 520V640M1100 520V640" stroke="${INK}" stroke-width="14" stroke-dasharray="30 18" fill="none"/>`;
for (const m of machines) {
  detail += box(m.x, m.y, m.w, m.h, '#fff', INK, 4, 10) + label(m.x + 20, m.y + 44, m.name, 26);
  detail += `<circle cx="${m.x + m.w / 2}" cy="${m.y + m.h / 2 + 20}" r="${Math.min(m.w, m.h) / 4}" fill="#E6EFE3" stroke="${INK}" stroke-width="4"/>`;
}

// ---------- gravação ----------
fs.writeFileSync(path.join(UPLOAD_DIR, 'exemplo-planta.svg'), svgWrap(W, H, plan));
fs.writeFileSync(path.join(UPLOAD_DIR, 'exemplo-producao.svg'), svgWrap(W2, H2, detail));

const insMap = db.prepare('INSERT INTO maps (name, image, width, height, is_root) VALUES (?, ?, ?, ?, ?)');
const insArea = db.prepare(`INSERT INTO areas (map_id, name, code, description, points, color, opacity, show_label, target_map_id, sort_order, lock_filter, show_lock, display_fields)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 1, ?)`);
const showRoom = JSON.stringify(['equipamento', 'bloqueado_por', 'data_bloqueio', 'dias_bloqueado', 'motivo']);
const showMachine = JSON.stringify(['bloqueado_por', 'data_bloqueio', 'dias_bloqueado', 'motivo', 'qtd_cadeados']);

db.transaction(() => {
  const rootId = insMap.run('Planta da fábrica', '/uploads/exemplo-planta.svg', W, H, 1).lastInsertRowid;
  const detailId = insMap.run('Produção · Linha 1', '/uploads/exemplo-producao.svg', W2, H2, 0).lastInsertRowid;
  rooms.forEach((r, i) =>
    insArea.run(rootId, r.name, r.code, r.desc, JSON.stringify(rectPts(r.x, r.y, r.w, r.h, W, H)), r.color, 0.28, r.detail ? detailId : null, i, `[Setor] == "${r.name}"`, showRoom));
  machines.forEach((m, i) =>
    insArea.run(detailId, m.name, m.code, m.desc, JSON.stringify(rectPts(m.x, m.y, m.w, m.h, W2, H2)), '#2E8B6B', 0.22, null, i, `[Setor] == "Produção" and [Equipamento] == "${m.name}"`, showMachine));
})();


// ---------- dados de LOTO de exemplo ----------
db.prepare("INSERT OR IGNORE INTO fields (key, label, type, expr, sort_order) VALUES ('dias_bloqueado', 'Dias bloqueado', 'number', ?, 8)")
  .run('if(isEmpty([Data de desbloqueio]), daysSince([Data de bloqueio]), diffDays([Data de bloqueio], [Data de desbloqueio]))');
db.prepare('INSERT INTO kpis (name, expr, sort_order) VALUES (?, ?, ?)').run('Ativos há mais de 3 dias', 'ativo and [Dias bloqueado] > 3', 1);
db.prepare('INSERT INTO kpis (name, expr, sort_order) VALUES (?, ?, ?)').run('Ativos sem motivo informado', 'ativo and isEmpty([Motivo])', 2);

let seedN = 42;
const rnd = () => { seedN = (seedN + 0x6d2b79f5) | 0; let t = Math.imul(seedN ^ (seedN >>> 15), 1 | seedN); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const sectors = {
  Recebimento: ['Doca 1', 'Doca 2', 'Doca 3', 'Esteira de descarga'],
  Produção: machines.map((m) => m.name),
  Estoque: ['Empilhadeira 01', 'Empilhadeira 02', 'Ponte rolante'],
  Expedição: ['Doca 4', 'Doca 5', 'Carregadora'],
  Manutenção: ['Torno CNC', 'Fresadora', 'Bancada de solda'],
  Escritório: ['Painel elétrico QDL-1'],
};
const people = ['Carlos Silva', 'Ana Souza', 'Marcos Lima', 'Juliana Rocha', 'Pedro Alves'];
const reasons = ['Troca de ferramenta', 'Manutenção preventiva', 'Limpeza', 'Reparo elétrico', 'Ajuste mecânico', 'Setup de linha'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const ago = (hours) => new Date(Date.now() - hours * 3600000);
const insRec = db.prepare('INSERT INTO records (data, hash) VALUES (?, ?)');
const addRec = (sector, equip, hoursAgo, durHours, extra = {}) => {
  const d = {
    equipamento: equip, setor: sector, bloqueado_por: pick(people), data_bloqueio: iso(ago(hoursAgo)),
    motivo: pick(reasons), qtd_cadeados: 1 + Math.floor(rnd() * 3), ...extra,
  };
  if (durHours != null) d.data_desbloqueio = iso(ago(hoursAgo - durHours));
  insRec.run(JSON.stringify(d), hashValues(d));
};
db.transaction(() => {
  // histórico (encerrados) nos últimos ~200 dias
  for (let i = 0; i < 140; i++) {
    const sector = pick(Object.keys(sectors));
    const hoursAgo = 30 + rnd() * 24 * 200;
    addRec(sector, pick(sectors[sector]), hoursAgo, 0.5 + rnd() * 30);
  }
  // bloqueios ativos agora
  addRec('Produção', 'Corte a laser', 30, null, { qtd_cadeados: 2 });
  addRec('Produção', 'Corte a laser', 26, null, { motivo: 'Reparo elétrico', qtd_cadeados: 1 });
  addRec('Produção', 'Solda robotizada', 100, null, { motivo: '' });
  addRec('Recebimento', 'Doca 2', 5, null);
  addRec('Estoque', 'Empilhadeira 01', 52, null);
  addRec('Manutenção', 'Torno CNC', 8, null);
  addRec('Expedição', 'Doca 4', 2, null);
})();

console.log('Planta de exemplo e registros de LOTOTO criados. Abra http://localhost:3001');
