import { Router } from 'express';
import { db, getSetting, setSetting } from './db.js';
import { DEFAULT_LANGUAGE, MASTER_TERMS, SUPPORTED_LANGUAGES, DEFAULT_TRANSLATIONS } from './i18n_keys.js';

export const router = Router();

const httpError = (status, message) => Object.assign(new Error(message), { status });

function hashDynamicText(value) {
  const text = String(value ?? '').trim();
  let first = 2166136261;
  let second = 2246822519;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

const dynamicFieldKey = (fieldKey, label = '') =>
  `dynamic.field.${encodeURIComponent(String(fieldKey))}.${hashDynamicText(label)}`;
const dynamicAreaKey = (areaId, property = 'name', text = '') =>
  `dynamic.area.${areaId}.${property}.${hashDynamicText(text)}`;
const dynamicMapKey = (mapId, name = '') =>
  `dynamic.map.${mapId}.name.${hashDynamicText(name)}`;
const dynamicRecordKey = (fieldKey, value) =>
  `dynamic.record.${encodeURIComponent(String(fieldKey))}.${hashDynamicText(value)}`;

export function getDynamicTerms() {
  const terms = [];
  const seen = new Set();
  const add = (term) => {
    if (!term.text || !term.text.trim() || seen.has(term.key)) return;
    seen.add(term.key);
    terms.push(term);
  };

  for (const map of db.prepare('SELECT id, name FROM maps ORDER BY id').all()) {
    add({
      key: dynamicMapKey(map.id, map.name),
      text: map.name,
      context: 'Nome de planta ou mapa',
      termType: 'dynamic',
      group: 'areas',
    });
  }

  for (const area of db.prepare('SELECT id, name, sub_label, description FROM areas ORDER BY id').all()) {
    add({
      key: dynamicAreaKey(area.id, 'name', area.name),
      text: area.name,
      context: `Nome da área #${area.id}`,
      termType: 'dynamic',
      group: 'areas',
    });
    add({
      key: dynamicAreaKey(area.id, 'sub_label', area.sub_label),
      text: area.sub_label,
      context: `Subtítulo da área #${area.id}`,
      termType: 'dynamic',
      group: 'areas',
    });
    add({
      key: dynamicAreaKey(area.id, 'description', area.description),
      text: area.description,
      context: `Descrição da área #${area.id}`,
      termType: 'dynamic',
      group: 'areas',
    });
  }

  for (const field of db.prepare("SELECT key, label FROM fields WHERE expr = '' ORDER BY sort_order, id").all()) {
    add({
      key: dynamicFieldKey(field.key, field.label),
      text: field.label,
      context: `Nome do campo (${field.key})`,
      termType: 'dynamic',
      group: 'fields',
    });
  }

  const recordValues = db.prepare(`
    SELECT DISTINCT f.key AS field_key, f.label AS field_label, j.value AS text
    FROM records r, json_each(r.data) j
    JOIN fields f ON f.key = j.key
    WHERE f.type = 'text' AND f.expr = '' AND j.type = 'text' AND trim(j.value) <> ''
  `).all();
  for (const value of recordValues) {
    add({
      key: dynamicRecordKey(value.field_key, value.text),
      text: value.text,
      context: `Valor do campo "${value.field_label}" em registros importados ou cadastrados`,
      termType: 'dynamic',
      group: 'records',
    });
  }

  return terms;
}

export function getConfiguredLanguages() {
  try {
    const raw = getSetting('i18n_languages');
    if (!raw) return [DEFAULT_LANGUAGE];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      if (!parsed.includes(DEFAULT_LANGUAGE)) {
        parsed.unshift(DEFAULT_LANGUAGE);
      }
      return parsed;
    }
  } catch {}
  return [DEFAULT_LANGUAGE];
}

export function getTranslationsForLang(code) {
  if (code === DEFAULT_LANGUAGE) {
    const base = { ...DEFAULT_TRANSLATIONS };
    try {
      const raw = getSetting(`i18n_translations_${DEFAULT_LANGUAGE}`);
      if (raw) {
        const overrides = JSON.parse(raw);
        Object.assign(base, overrides);
      }
    } catch {}
    return base;
  }

  try {
    const raw = getSetting(`i18n_translations_${code}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
}

export function calculateProgress(code, translations, dynamicTerms = getDynamicTerms()) {
  const terms = MASTER_TERMS.concat(dynamicTerms);
  const total = terms.length;
  if (code === DEFAULT_LANGUAGE) {
    return { total, translated: total, percentage: 100 };
  }

  let translated = 0;
  for (const term of terms) {
    const val = translations[term.key];
    if (typeof val === 'string' && val.trim().length > 0) {
      translated++;
    }
  }
  const percentage = total > 0 ? Math.round((translated / total) * 100) : 0;
  return { total, translated, percentage };
}

// Retorna todos os dados de tradução da fábrica
router.get('/translations', (req, res) => {
  const langs = getConfiguredLanguages();
  const dynamicTerms = getDynamicTerms();
  const translationsMap = {};
  const availableLanguages = langs.map((code) => {
    const info = SUPPORTED_LANGUAGES.find((l) => l.code === code) || { code, name: code, flag: '🌐' };
    const trans = getTranslationsForLang(code);
    translationsMap[code] = trans;
    const progress = calculateProgress(code, trans, dynamicTerms);
    return { ...info, ...progress };
  });

  const aiKey = (process.env.GROQ_API_KEY || getSetting('ai_translation_key') || '').trim();
  const aiProvider = getSetting('ai_translation_provider') || 'groq';
  const aiModel = getSetting('ai_translation_model') || '';

  const isLopesR = String(req.user?.username || '').trim().toLowerCase() === 'lopesr';

  // Somente o usuário lopesr/LopesR pode visualizar a chave de API
  let aiKeyMasked = null;
  if (aiKey && isLopesR) {
    const prefixLen = Math.min(5, aiKey.length);
    aiKeyMasked = `${aiKey.slice(0, prefixLen)}****************`;
  }

  res.json({
    availableLanguages,
    supportedLanguages: SUPPORTED_LANGUAGES,
    translations: translationsMap,
    masterTerms: MASTER_TERMS,
    dynamicTerms,
    aiConfigured: Boolean(aiKey),
    aiProvider,
    aiKeyMasked,
    aiModel,
    canManageAiKey: isLopesR,
  });
});

// Adiciona um novo idioma à fábrica
router.post('/translations/languages', (req, res, next) => {
  try {
    const { code } = req.body || {};
    if (!code) throw httpError(400, 'Código do idioma não informado.');
    const supported = SUPPORTED_LANGUAGES.find((l) => l.code === code);
    if (!supported) throw httpError(400, 'Idioma não suportado pelo sistema.');

    const langs = getConfiguredLanguages();
    if (!langs.includes(code)) {
      langs.push(code);
      setSetting('i18n_languages', JSON.stringify(langs));
      // Garante inicialização com 0%
      if (!getSetting(`i18n_translations_${code}`)) {
        setSetting(`i18n_translations_${code}`, JSON.stringify({}));
      }
    }

    const trans = getTranslationsForLang(code);
    const progress = calculateProgress(code, trans);

    res.json({
      ok: true,
      language: { ...supported, ...progress },
      availableLanguages: langs,
    });
  } catch (err) {
    next(err);
  }
});

// Remove um idioma da fábrica
router.delete('/translations/languages/:code', (req, res, next) => {
  try {
    const { code } = req.params;
    if (code === DEFAULT_LANGUAGE) {
      throw httpError(400, 'O idioma Português (Brasil) é a base do sistema e não pode ser removido.');
    }

    let langs = getConfiguredLanguages();
    langs = langs.filter((l) => l !== code);
    setSetting('i18n_languages', JSON.stringify(langs));

    res.json({ ok: true, availableLanguages: langs });
  } catch (err) {
    next(err);
  }
});

// Salva termos traduzidos para um idioma
router.put('/translations/:code', (req, res, next) => {
  try {
    const { code } = req.params;
    const { terms } = req.body || {};
    if (!terms || typeof terms !== 'object') {
      throw httpError(400, 'Dicionário de termos inválido.');
    }

    const current = getTranslationsForLang(code);
    const updated = { ...current, ...terms };

    setSetting(`i18n_translations_${code}`, JSON.stringify(updated));

    const progress = calculateProgress(code, updated);
    res.json({ ok: true, translations: updated, progress });
  } catch (err) {
    next(err);
  }
});

// Salva a chave e o provedor de Inteligência Artificial para tradução
router.post('/translations/ai-key', (req, res, next) => {
  try {
    const isLopesR = String(req.user?.username || '').trim().toLowerCase() === 'lopesr';
    if (!isLopesR) {
      throw httpError(403, 'Apenas o usuário lopesr tem permissão para configurar a chave de API da Inteligência Artificial.');
    }
    const { key, provider, model } = req.body || {};
    const trimmedKey = String(key || '').trim();
    setSetting('ai_translation_key', trimmedKey);
    if (provider) {
      setSetting('ai_translation_provider', String(provider).trim());
    }
    if (model) {
      setSetting('ai_translation_model', String(model).trim());
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Remove a chave de Inteligência Artificial para tradução
router.delete('/translations/ai-key', (req, res, next) => {
  try {
    const isLopesR = String(req.user?.username || '').trim().toLowerCase() === 'lopesr';
    if (!isLopesR) {
      throw httpError(403, 'Apenas o usuário lopesr tem permissão para remover a chave de API da Inteligência Artificial.');
    }
    setSetting('ai_translation_key', '');
    setSetting('ai_translation_model', '');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Salva o modelo selecionado para tradução
router.post('/translations/ai-model', (req, res, next) => {
  try {
    const { model } = req.body || {};
    const trimmed = String(model || '').trim();
    if (!trimmed) throw httpError(400, 'Modelo não informado.');
    setSetting('ai_translation_model', trimmed);
    res.json({ ok: true, model: trimmed });
  } catch (err) {
    next(err);
  }
});

// Lista modelos disponíveis no Groq
const fetchGroqModels = async (apiKey) => {
  let groqRes;
  try {
    groqRes = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch (netErr) {
    throw httpError(400, `Não foi possível conectar ao provedor de IA: ${netErr.message}`);
  }

  if (!groqRes.ok) {
    const errText = await groqRes.text().catch(() => '');
    let msg = 'chave de API inválida ou sem permissão.';
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.message) msg = parsed.error.message;
    } catch {}
    throw httpError(400, `Erro ao consultar modelos (${groqRes.status}): ${msg}`);
  }

  const json = await groqRes.json();
  const rawList = Array.isArray(json?.data) ? json.data : [];
  // Filtra modelos utilizáveis em chat/completions (exclui whisper/áudio)
  const models = rawList
    .filter((m) => !m.id.toLowerCase().includes('whisper'))
    .map((m) => ({
      id: m.id,
      owned_by: m.owned_by,
      context_window: m.context_window,
      active: m.active !== false,
    }));

  return models;
};

router.get('/translations/ai-models', async (_req, res, next) => {
  try {
    const apiKey = (process.env.GROQ_API_KEY || getSetting('ai_translation_key') || '').trim();
    if (!apiKey) {
      throw httpError(400, 'Chave de Inteligência Artificial não configurada.');
    }
    const models = await fetchGroqModels(apiKey);
    res.json({ ok: true, models });
  } catch (err) {
    next(err);
  }
});

router.post('/translations/ai-models', async (req, res, next) => {
  try {
    const { key } = req.body || {};
    const apiKey = String(key || process.env.GROQ_API_KEY || getSetting('ai_translation_key') || '').trim();
    if (!apiKey) {
      throw httpError(400, 'Chave de Inteligência Artificial não informada.');
    }
    const models = await fetchGroqModels(apiKey);
    res.json({ ok: true, models });
  } catch (err) {
    next(err);
  }
});

// Tradução automatizada com IA (Groq free tier)
router.post('/translations/ai-translate', async (req, res, next) => {
  try {
    const { targetLang, terms } = req.body || {};
    if (!targetLang) throw httpError(400, 'Idioma de destino não informado.');
    if (!Array.isArray(terms) || terms.length === 0) {
      throw httpError(400, 'Nenhum termo para traduzir.');
    }

    const apiKey = (process.env.GROQ_API_KEY || getSetting('ai_translation_key') || '').trim();
    if (!apiKey) {
      throw httpError(
        400,
        'Chave de Inteligência Artificial não configurada. Por favor, informe sua chave nas configurações de tradução.'
      );
    }

    const model = (getSetting('ai_translation_model') || 'llama-3.1-8b-instant').trim();
    const targetInfo = SUPPORTED_LANGUAGES.find((l) => l.code === targetLang) || { name: targetLang };

    const promptMessages = [
      {
        role: 'system',
        content:
          'You are an expert professional software translator and localizer. You translate UI strings from Brazilian Portuguese (pt-BR) to the requested target language accurately.\n' +
          'Rules:\n' +
          '1. Respect the context provided for each term.\n' +
          '2. Preserve exact placeholder tokens like {count}, {name}, {page}, {pages}, {id}, {days}, {group}.\n' +
          '3. Keep punctuation, case, and brevity appropriate for UI elements.\n' +
          '4. Output ONLY a valid JSON object where keys are the exact semantic keys provided, and values are the translated text strings. No markdown formatting, no backticks, no explanations.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          targetLanguage: targetInfo.name,
          targetCode: targetLang,
          terms: terms.map((t) => ({ key: t.key, source: t.text, context: t.context })),
        }),
      },
    ];

    let groqResponse;
    try {
      groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: promptMessages,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (netErr) {
      throw httpError(400, `Não foi possível conectar ao provedor de Inteligência Artificial: ${netErr.message}`);
    }

    if (!groqResponse.ok) {
      const errText = await groqResponse.text().catch(() => '');
      let errorDetail = 'verifique a chave de API informada.';
      try {
        const parsed = JSON.parse(errText);
        if (parsed?.error?.message) {
          errorDetail = parsed.error.message;
        }
      } catch {}
      // Retorna status 400 (nunca 401 do provider) para que a aplicação não desconecte a sessão do usuário
      throw httpError(
        400,
        `Erro na comunicação com a Inteligência Artificial (${groqResponse.status}): ${errorDetail}`
      );
    }

    const data = await groqResponse.json();
    const rawContent = data.choices?.[0]?.message?.content || '{}';
    let translatedMap = {};
    try {
      translatedMap = JSON.parse(rawContent);
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) translatedMap = JSON.parse(match[0]);
    }

    res.json({ ok: true, translations: translatedMap });
  } catch (err) {
    next(err);
  }
});

// Exporta arquivo JSON de tradução
router.get('/translations/export/:code', (req, res, next) => {
  try {
    const { code } = req.params;
    const translations = getTranslationsForLang(code);
    const payload = {
      language: code,
      exported_at: new Date().toISOString(),
      translations,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="translations-${code}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    next(err);
  }
});

// Importa arquivo JSON de tradução
router.post('/translations/import/:code', (req, res, next) => {
  try {
    const { code } = req.params;
    let incoming = req.body;
    if (incoming?.translations && typeof incoming.translations === 'object') {
      incoming = incoming.translations;
    }

    if (!incoming || typeof incoming !== 'object') {
      throw httpError(400, 'Arquivo JSON inválido. Deve conter um objeto de traduções.');
    }

    const current = getTranslationsForLang(code);
    const updated = { ...current };
    let count = 0;

    for (const [k, v] of Object.entries(incoming)) {
      if (typeof v === 'string' && v.trim().length > 0) {
        updated[k] = v.trim();
        count++;
      }
    }

    setSetting(`i18n_translations_${code}`, JSON.stringify(updated));

    // Assegura que o idioma está ativo
    const langs = getConfiguredLanguages();
    if (!langs.includes(code)) {
      langs.push(code);
      setSetting('i18n_languages', JSON.stringify(langs));
    }

    const progress = calculateProgress(code, updated);
    res.json({ ok: true, count, progress, translations: updated });
  } catch (err) {
    next(err);
  }
});
