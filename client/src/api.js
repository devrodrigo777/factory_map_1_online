async function request(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error('Não foi possível falar com o servidor. Verifique se ele está rodando.');
  }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('auth:expired'));
    let data = {};
    try {
      data = await res.json();
    } catch { /* corpo vazio */ }
    const err = new Error(data.error || `Erro ${res.status}`);
    Object.assign(err, data);
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const form = (method, file, name) => {
  const fd = new FormData();
  if (name) fd.append('name', name);
  fd.append('image', file);
  return { method, body: fd };
};

export const api = {
  listMaps: () => request('/api/maps'),
  getRoot: () => request('/api/maps/root'),
  getMap: (id) => request(`/api/maps/${id}`),
  createMap: (file, name) => request('/api/maps', form('POST', file, name)),
  patchMap: (id, body) => request(`/api/maps/${id}`, json('PATCH', body)),
  replaceImage: (id, file) => request(`/api/maps/${id}/image`, form('PUT', file)),
  deleteMap: (id) => request(`/api/maps/${id}`, { method: 'DELETE' }),
  saveAreas: (id, areas) => request(`/api/maps/${id}/areas`, json('PUT', { areas })),

  // acesso
  authConfig: () => request('/api/auth/config'),
  getCaptcha: () => request('/api/auth/captcha'),
  me: () => request('/api/auth/me'),
  login: (username, password, captcha, captcha_token) => request('/api/auth/login', json('POST', { username, password, captcha, captcha_token })),
  setup: (body) => request('/api/auth/setup', json('POST', body)),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  changePassword: (current, next) => request('/api/auth/password', json('POST', { current, next })),
  listUsers: () => request('/api/users'),
  createUser: (body) => request('/api/users', json('POST', body)),
  patchUser: (id, body) => request(`/api/users/${id}`, json('PATCH', body)),
  deleteUser: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),
  setPublicView: (enabled) => request('/api/users/public-view', json('PUT', { enabled })),
  audit: () => request('/api/audit?limit=200'),

  // backup
  listBackups: () => request('/api/backup/list'),
  createBackup: (body) => request('/api/backup/create', json('POST', body)),
  deleteBackup: (name) => request(`/api/backup/files/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  inspectBackup: ({ file, name }) => {
    if (!file) return request('/api/backup/inspect', json('POST', { name }));
    const fd = new FormData();
    fd.append('file', file);
    return request('/api/backup/inspect', { method: 'POST', body: fd });
  },
  restoreBackup: ({ file, name, mode }) => {
    if (!file) return request('/api/backup/restore', json('POST', { name, mode }));
    const fd = new FormData();
    fd.append('mode', mode);
    fd.append('file', file);
    return request('/api/backup/restore', { method: 'POST', body: fd });
  },

  // sincronização
  exportSyncPackage: (type) => request('/api/sync/export', json('POST', { type })),
  applySyncPackage: ({ code, password, mode }) => request('/api/sync/apply', json('POST', { code, password, mode })),
  getSyncSession: (id) => request(`/api/sync/session/${id}`),

  // perfis de importação
  listProfiles: () => request('/api/import-profiles'),
  saveProfile: (body) => request('/api/import-profiles', json('POST', body)),
  deleteProfile: (id) => request(`/api/import-profiles/${id}`, { method: 'DELETE' }),

  // configurações e tarefas automáticas
  getConfig: () => request('/api/config'),
  saveConfig: (body) => request('/api/config', json('PUT', body)),
  testFolder: (path, write) => request('/api/config/test-folder', json('POST', { path, write })),
  runBackupJob: () => request('/api/jobs/backup/run', json('POST', {})),
  runImportJob: () => request('/api/jobs/import/run', json('POST', {})),

  // histórico
  areaHistory: (areaId, days) => request(`/api/areas/${areaId}/history?days=${days}`),
  recordHistory: (id) => request(`/api/records/${id}/history`),
  recentHistory: () => request('/api/history/recent?limit=200'),

  // LOTO
  lockStatus: (mapId) => request(`/api/maps/${mapId}/lock-status`),
  areaRecords: (areaId, history) => request(`/api/areas/${areaId}/records${history ? '?history=1' : ''}`),
  stats: (params) => request(`/api/stats?${new URLSearchParams(params)}`),

  listFields: () => request('/api/fields'),
  createField: (body) => request('/api/fields', json('POST', body)),
  patchField: (id, body) => request(`/api/fields/${id}`, json('PATCH', body)),
  deleteField: (id) => request(`/api/fields/${id}`, { method: 'DELETE' }),
  orderFields: (keys) => request('/api/fields/order', json('PUT', { keys })),
  fieldValues: (key) => request(`/api/fields/${encodeURIComponent(key)}/values`),

  getSettings: () => request('/api/settings'),
  saveSettings: (body) => request('/api/settings', json('PUT', body)),
  listKpis: () => request('/api/kpis'),
  createKpi: (body) => request('/api/kpis', json('POST', body)),
  patchKpi: (id, body) => request(`/api/kpis/${id}`, json('PATCH', body)),
  deleteKpi: (id) => request(`/api/kpis/${id}`, { method: 'DELETE' }),
  testExpr: (expr) => request('/api/expr/test', json('POST', { expr })),

  listRecords: (params) => request(`/api/records?${new URLSearchParams(params)}`),
  createRecord: (values) => request('/api/records', json('POST', { values })),
  updateRecord: (id, values) => request(`/api/records/${id}`, json('PUT', { values })),
  deleteRecord: (id) => request(`/api/records/${id}`, { method: 'DELETE' }),
  deleteRecords: (ids) => request('/api/records/delete-many', json('POST', { ids })),

  importPreview: (file, sheet) => {
    const fd = new FormData();
    if (sheet) fd.append('sheet', sheet);
    fd.append('file', file);
    return request('/api/import/preview', { method: 'POST', body: fd });
  },
  importConfirm: (file, sheet, mapping, skipDuplicates) => {
    const fd = new FormData();
    fd.append('sheet', sheet || '');
    fd.append('mapping', JSON.stringify(mapping));
    fd.append('skipDuplicates', String(skipDuplicates));
    fd.append('file', file);
    return request('/api/import', { method: 'POST', body: fd });
  },
  listImports: () => request('/api/imports'),
  deleteImport: (id) => request(`/api/imports/${id}`, { method: 'DELETE' }),
};

// Baixa a imagem antes de trocar de tela, para a transição não "piscar".
export const preload = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = src;
  });
