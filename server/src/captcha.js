import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

// Segredo persistente do servidor para tokens de captcha e HMAC
const SECRET_FILE = path.join(DATA_DIR, 'app_secret.key');
function loadSecret() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  try {
    if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
    const sec = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, sec, { mode: 0o600 });
    return sec;
  } catch {
    return 'factory-map-default-secret-change-me';
  }
}

export const APP_SECRET = loadSecret();

const CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5 minutos de validade

function randomString(len = 5) {
  let res = '';
  for (let i = 0; i < len; i++) {
    res += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return res;
}

function randomColor() {
  const colors = ['#60a5fa', '#93c5fd', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa'];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Gera um SVG com texto distorcido, ruído e linhas de segurança.
 */
export function generateCaptcha() {
  const code = randomString(5);
  const width = 170;
  const height = 48;

  // Linhas aleatórias de interferência
  const lines = Array.from({ length: 4 }).map(() => {
    const x1 = Math.floor(Math.random() * (width / 2));
    const y1 = Math.floor(Math.random() * height);
    const x2 = Math.floor(width / 2 + Math.random() * (width / 2));
    const y2 = Math.floor(Math.random() * height);
    const cx = Math.floor(Math.random() * width);
    const cy = Math.floor(Math.random() * height);
    return `<path d="M${x1},${y1} Q${cx},${cy} ${x2},${y2}" stroke="${randomColor()}" stroke-width="1.8" fill="none" opacity="0.65" />`;
  }).join('');

  // Pontos de ruído
  const dots = Array.from({ length: 24 }).map(() => {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const r = (Math.random() * 1.5 + 0.5).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${randomColor()}" opacity="0.5" />`;
  }).join('');

  // Letras estilizadas com rotação e posição variável
  const letters = code.split('').map((char, i) => {
    const x = 20 + i * 28 + Math.floor(Math.random() * 6 - 3);
    const y = 33 + Math.floor(Math.random() * 6 - 3);
    const rot = Math.floor(Math.random() * 32 - 16);
    const color = randomColor();
    const size = 24 + Math.floor(Math.random() * 5);
    return `<text x="${x}" y="${y}" font-family="monospace, sans-serif" font-weight="bold" font-size="${size}" fill="${color}" transform="rotate(${rot} ${x} ${y})" text-anchor="middle">${char}</text>`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#131c26;border-radius:8px;border:1px solid #2a3a4d;">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#141f2d"/>
        <stop offset="100%" stop-color="#0f1722"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    ${dots}
    ${lines}
    ${letters}
  </svg>`;

  const expiresAt = Date.now() + CAPTCHA_TTL_MS;
  const signature = crypto.createHmac('sha256', APP_SECRET)
    .update(`${code.toUpperCase()}|${expiresAt}`)
    .digest('hex');

  const token = `${expiresAt}.${signature}`;

  return {
    svg: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    token,
  };
}

/**
 * Valida a resposta do captcha contra o token assinado.
 */
export function verifyCaptcha(input, token) {
  if (!input || !token) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  const [expiresAtStr, signature] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || Date.now() > expiresAt) return false;

  const clean = String(input).trim().toUpperCase();
  const expected = crypto.createHmac('sha256', APP_SECRET)
    .update(`${clean}|${expiresAt}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
