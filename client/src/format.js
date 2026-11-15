const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function parsePhotoUrls(v) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  const s = String(v).trim();
  if (!s) return [];
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(String).map((x) => x.trim()).filter(Boolean);
    } catch {}
  }
  return [s];
}

export function formatDurationHuman(hours) {
  if (hours == null || Number.isNaN(Number(hours))) return '—';
  const hTotal = Number(hours);
  if (hTotal < 0) return '0 min';

  // Menor que 1 dia (menos de 24 horas): horas e minutos sem decimais
  if (hTotal < 24) {
    let h = Math.floor(hTotal);
    let m = Math.round((hTotal - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    if (h >= 24) return '1 dia';
    if (h === 0) return `${Math.max(1, m)} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
  }

  // A partir de 1 dia: quantidade de dias inteiro
  const totalDays = Math.floor(hTotal / 24);

  // Menos de 30 dias (menos de 1 mês): quantidade de dias inteiro
  if (totalDays < 30) {
    return `${totalDays} ${totalDays === 1 ? 'dia' : 'dias'}`;
  }

  // De 1 mês até 11 meses (30 a 359 dias): formato humano (ex.: 1 mês e 2 dias)
  if (totalDays < 360) {
    const months = Math.floor(totalDays / 30);
    const remDays = totalDays % 30;
    const mStr = `${months} ${months === 1 ? 'mês' : 'meses'}`;
    if (remDays === 0) return mStr;
    return `${mStr} e ${remDays} ${remDays === 1 ? 'dia' : 'dias'}`;
  }

  // Maior que 11 meses (>= 360 dias): "1 ano e x dias", etc.
  const years = Math.max(1, Math.floor(totalDays / 365));
  const remDays = totalDays >= 365 ? totalDays % 365 : 0;
  const yStr = `${years} ${years === 1 ? 'ano' : 'anos'}`;
  if (remDays === 0) return yStr;
  return `${yStr} e ${remDays} ${remDays === 1 ? 'dia' : 'dias'}`;
}

export function formatDays(days) {
  if (days == null || Number.isNaN(Number(days))) return '—';
  return formatDurationHuman(Number(days) * 24);
}

export function formatHours(h) {
  return formatDurationHuman(h);
}

export function formatValue(type, v, key) {
  if (v == null || v === '') return '—';
  if (key === 'dias_bloqueado' || (typeof key === 'string' && (key.includes('dias') || key.includes('duracao')))) {
    const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
    if (!Number.isNaN(n)) return formatDays(n);
  }
  if (type === 'number') return typeof v === 'number' ? num.format(v) : String(v);
  if (type === 'photo') {
    const urls = parsePhotoUrls(v);
    if (!urls.length) return '—';
    return urls.length === 1 ? '1 anexo' : `${urls.length} anexos`;
  }
  if (type === 'date') {
    const s = String(v);
    const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
    if (Number.isNaN(d.getTime())) return s;
    return s.length === 10
      ? d.toLocaleDateString('pt-BR')
      : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
  return String(v);
}

export const formatInt = (n) => (n == null ? '—' : new Intl.NumberFormat('pt-BR').format(n));

// valor para <input type="datetime-local">
export const toInputDate = (v) => (!v ? '' : String(v).length === 10 ? `${v}T00:00` : String(v).slice(0, 16));
export const nowInput = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const ROLE_LABELS = {
  equipment: 'Equipamento',
  sector: 'Setor',
  locked_by: 'Quem bloqueou',
  locked_at: 'Data de bloqueio',
  unlocked_at: 'Data de desbloqueio',
};

export const ROLE_NAMES = { viewer: 'Visualizador', operator: 'Operador', admin: 'Administrador' };
export const ROLE_HELP = {
  viewer: 'Vê o mapa, os cadeados, o dashboard e os registros. Não altera nada.',
  operator: 'Tudo do Visualizador, mais: criar/editar registros, registrar desbloqueios e importar Excel.',
  admin: 'Acesso total: plantas e áreas, campos, KPIs, usuários, backup e restauração.',
};
export const formatBytes = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
export const formatDateTime = (s) => {
  if (!s) return '—';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`); // o SQLite guarda em UTC
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

// faixa de cor do cadeado conforme a idade (horas) do bloqueio
export const stageFor = (hours, stages = []) =>
  stages.reduce((cur, s) => (hours != null && hours >= s.min_hours ? s : cur), stages[0] ?? { color: '#E4572E', label: '' });
