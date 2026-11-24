import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api.js';
import { DEFAULT_LANGUAGE, DEFAULT_TRANSLATIONS, MASTER_TERMS, SUPPORTED_LANGUAGES } from './keys.js';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    return localStorage.getItem('app_language') || DEFAULT_LANGUAGE;
  });

  const [availableLanguages, setAvailableLanguages] = useState(() => {
    return [
      {
        code: DEFAULT_LANGUAGE,
        name: 'Português (Brasil)',
        flag: '🇧🇷',
        total: MASTER_TERMS.length,
        translated: MASTER_TERMS.length,
        percentage: 100,
      },
    ];
  });

  const [translationsMap, setTranslationsMap] = useState(() => ({
    [DEFAULT_LANGUAGE]: { ...DEFAULT_TRANSLATIONS },
  }));

  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiKeyMasked, setAiKeyMasked] = useState(null);
  const [aiProvider, setAiProvider] = useState('groq');
  const [loading, setLoading] = useState(true);

  const reloadTranslations = useCallback(async () => {
    try {
      const data = await api.getTranslations();
      if (data?.availableLanguages) {
        setAvailableLanguages(data.availableLanguages);
      }
      if (data?.translations) {
        setTranslationsMap((prev) => ({
          ...prev,
          ...data.translations,
          [DEFAULT_LANGUAGE]: {
            ...DEFAULT_TRANSLATIONS,
            ...(data.translations[DEFAULT_LANGUAGE] || {}),
          },
        }));
      }
      setAiConfigured(!!data?.aiConfigured);
      setAiKeyMasked(data?.aiKeyMasked || null);
      setAiProvider(data?.aiProvider || 'groq');
    } catch {
      // Falha silenciosa em offline sem rede
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadTranslations();
  }, [reloadTranslations]);

  const setLanguage = useCallback((code) => {
    setLanguageState(code);
    localStorage.setItem('app_language', code);
  }, []);

  const currentLanguage = useMemo(() => {
    return (
      availableLanguages.find((l) => l.code === language) ||
      SUPPORTED_LANGUAGES.find((l) => l.code === language) || {
        code: language,
        name: language,
        flag: '🌐',
      }
    );
  }, [availableLanguages, language]);

  const t = useCallback(
    (key, fallbackOrParams, maybeParams) => {
      let fallback = '';
      let params = {};

      if (typeof fallbackOrParams === 'object' && fallbackOrParams !== null) {
        params = fallbackOrParams;
      } else if (typeof fallbackOrParams === 'string') {
        fallback = fallbackOrParams;
        if (typeof maybeParams === 'object' && maybeParams !== null) {
          params = maybeParams;
        }
      }

      const currentDict = translationsMap[language] || {};
      let rawText = currentDict[key];

      if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
        rawText = DEFAULT_TRANSLATIONS[key] || fallback || key;
      }

      if (params && Object.keys(params).length > 0) {
        return rawText.replace(/\{(\w+)\}/g, (_, placeholder) => {
          return params[placeholder] !== undefined ? String(params[placeholder]) : `{${placeholder}}`;
        });
      }

      return rawText;
    },
    [language, translationsMap]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      currentLanguage,
      availableLanguages,
      translations: translationsMap,
      masterTerms: MASTER_TERMS,
      supportedLanguages: SUPPORTED_LANGUAGES,
      aiConfigured,
      aiKeyMasked,
      aiProvider,
      loading,
      t,
      reloadTranslations,
    }),
    [
      language,
      setLanguage,
      currentLanguage,
      availableLanguages,
      translationsMap,
      aiConfigured,
      aiKeyMasked,
      aiProvider,
      loading,
      t,
      reloadTranslations,
    ]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback gracioso se usado fora do Provider
    return {
      t: (key, fallback, params) => {
        let text = DEFAULT_TRANSLATIONS[key] || (typeof fallback === 'string' ? fallback : key);
        const p = typeof fallback === 'object' ? fallback : params;
        if (p) {
          text = text.replace(/\{(\w+)\}/g, (_, k) => (p[k] !== undefined ? String(p[k]) : `{${k}}`));
        }
        return text;
      },
      language: DEFAULT_LANGUAGE,
      setLanguage: () => {},
      currentLanguage: { code: DEFAULT_LANGUAGE, name: 'Português (Brasil)', flag: '🇧🇷' },
      availableLanguages: [],
      translations: {},
      masterTerms: MASTER_TERMS,
      reloadTranslations: () => {},
    };
  }
  return ctx;
}
