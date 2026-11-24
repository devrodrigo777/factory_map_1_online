import { Router } from 'express';
import { getSetting, setSetting } from './db.js';
import { DEFAULT_LANGUAGE, MASTER_TERMS, SUPPORTED_LANGUAGES, DEFAULT_TRANSLATIONS } from './i18n_keys.js';

export const router = Router();

const httpError = (status, message) => Object.assign(new Error(message), { status });

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

export function calculateProgress(code, translations) {
  const total = MASTER_TERMS.length;
  if (code === DEFAULT_LANGUAGE) {
    return { total, translated: total, percentage: 100 };
  }

  let translated = 0;
  for (const term of MASTER_TERMS) {
    const val = translations[term.key];
    if (typeof val === 'string' && val.trim().length > 0) {
      translated++;
    }
  }
  const percentage = total > 0 ? Math.round((translated / total) * 100) : 0;
  return { total, translated, percentage };
}

// Retorna todos os dados de tradução da fábrica
router.get('/translations', (_req, res) => {
  const langs = getConfiguredLanguages();
  const translationsMap = {};
  const availableLanguages = langs.map((code) => {
    const info = SUPPORTED_LANGUAGES.find((l) => l.code === code) || { code, name: code, flag: '🌐' };
    const trans = getTranslationsForLang(code);
    translationsMap[code] = trans;
    const progress = calculateProgress(code, trans);
    return { ...info, ...progress };
  });

  const aiKey = process.env.GROQ_API_KEY || getSetting('ai_translation_key');

  res.json({
    availableLanguages,
    supportedLanguages: SUPPORTED_LANGUAGES,
    translations: translationsMap,
    masterTerms: MASTER_TERMS,
    aiConfigured: Boolean(aiKey && aiKey.trim().length > 0),
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

// Salva a chave de Inteligência Artificial para tradução
router.post('/translations/ai-key', (req, res, next) => {
  try {
    const { key } = req.body || {};
    setSetting('ai_translation_key', String(key || '').trim());
    res.json({ ok: true });
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

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: promptMessages,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text().catch(() => '');
      throw httpError(
        groqResponse.status,
        `Erro na comunicação com a Inteligência Artificial (${groqResponse.status}): ${errText || 'verifique a chave informada.'}`
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
