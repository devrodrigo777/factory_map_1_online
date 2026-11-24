import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Icon from './Icons.jsx';
import Modal from './Modal.jsx';
import { useToast } from './Toast.jsx';
import { useConfirm } from './ConfirmModal.jsx';
import { useTranslation } from '../i18n/I18nContext.jsx';
import { DEFAULT_LANGUAGE } from '../i18n/keys.js';

export default function TranslationTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const {
    masterTerms,
    supportedLanguages,
    availableLanguages,
    translations,
    reloadTranslations,
    aiConfigured,
    aiKeyMasked,
    aiProvider,
    aiModel,
    t,
  } = useTranslation();

  const fileInputRef = useRef(null);

  const [selectedLang, setSelectedLang] = useState(DEFAULT_LANGUAGE);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'pending' | 'completed'
  const [searchQuery, setSearchQuery] = useState('');
  const [editingValues, setEditingValues] = useState({});
  const [dirtyKeys, setDirtyKeys] = useState(new Set());
  const [translatingKeys, setTranslatingKeys] = useState(new Set());
  const [batchTranslating, setBatchTranslating] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [candidateLang, setCandidateLang] = useState('');
  const [selectedProvider, setSelectedProvider] = useState(aiProvider || 'groq');
  const [isEditingAiKey, setIsEditingAiKey] = useState(false);
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [savingAiKey, setSavingAiKey] = useState(false);
  const [aiCardOpen, setAiCardOpen] = useState(false);

  // Estados para seleção e gerenciamento dinâmico de modelos de IA
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(aiModel || '');
  const [loadingModels, setLoadingModels] = useState(false);
  const [isEditingModel, setIsEditingModel] = useState(false);
  const [savingModel, setSavingModel] = useState(false);

  useEffect(() => {
    if (aiProvider) setSelectedProvider(aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    if (aiModel) setSelectedModel(aiModel);
  }, [aiModel]);

  // Idioma selecionado ativo
  const currentLangInfo = useMemo(() => {
    return (
      availableLanguages.find((l) => l.code === selectedLang) ||
      supportedLanguages.find((l) => l.code === selectedLang) || {
        code: selectedLang,
        name: selectedLang,
        flag: '🌐',
      }
    );
  }, [availableLanguages, supportedLanguages, selectedLang]);

  // Dicionário de termos do idioma selecionado
  const currentDict = useMemo(() => {
    return translations[selectedLang] || {};
  }, [translations, selectedLang]);

  // Inicializa valores em edição ao trocar de idioma
  useEffect(() => {
    setEditingValues({});
    setDirtyKeys(new Set());
  }, [selectedLang]);

  // Idiomas ainda disponíveis para adicionar
  const remainingLanguages = useMemo(() => {
    const existingCodes = new Set(availableLanguages.map((l) => l.code));
    return supportedLanguages.filter((l) => !existingCodes.has(l.code));
  }, [availableLanguages, supportedLanguages]);

  // Filtra e pesquisa termos
  const filteredTerms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return masterTerms.filter((term) => {
      const currentVal =
        editingValues[term.key] !== undefined ? editingValues[term.key] : currentDict[term.key] || '';
      const isPending = !currentVal || currentVal.trim() === '';

      if (filterMode === 'pending' && !isPending) return false;
      if (filterMode === 'completed' && isPending) return false;

      if (!q) return true;
      return (
        term.key.toLowerCase().includes(q) ||
        term.text.toLowerCase().includes(q) ||
        (term.context && term.context.toLowerCase().includes(q)) ||
        currentVal.toLowerCase().includes(q)
      );
    });
  }, [masterTerms, filterMode, searchQuery, editingValues, currentDict]);

  // Contadores
  const stats = useMemo(() => {
    let pending = 0;
    let completed = 0;
    for (const term of masterTerms) {
      const val =
        editingValues[term.key] !== undefined ? editingValues[term.key] : currentDict[term.key] || '';
      if (!val || val.trim() === '') pending++;
      else completed++;
    }
    return {
      total: masterTerms.length,
      pending,
      completed,
      percentage:
        selectedLang === DEFAULT_LANGUAGE
          ? 100
          : masterTerms.length > 0
          ? Math.round((completed / masterTerms.length) * 100)
          : 0,
    };
  }, [masterTerms, editingValues, currentDict, selectedLang]);

  const handleInputChange = (key, val) => {
    setEditingValues((prev) => ({ ...prev, [key]: val }));
    setDirtyKeys((prev) => new Set(prev).add(key));
  };

  const handleSaveTerm = async (key) => {
    const val = editingValues[key] !== undefined ? editingValues[key] : currentDict[key] || '';
    try {
      await api.saveTranslations(selectedLang, { [key]: val });
      setDirtyKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      await reloadTranslations();
      toast(t('translation.term_saved', 'Tradução salva com sucesso.'));
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // Tradução de termo único com IA
  const handleAiTranslateSingle = async (term) => {
    setTranslatingKeys((prev) => new Set(prev).add(term.key));
    try {
      const res = await api.aiTranslate(selectedLang, [
        { key: term.key, text: term.text, context: term.context },
      ]);
      const translated = res.translations?.[term.key];
      if (translated) {
        setEditingValues((prev) => ({ ...prev, [term.key]: translated }));
        await api.saveTranslations(selectedLang, { [term.key]: translated });
        setDirtyKeys((prev) => {
          const next = new Set(prev);
          next.delete(term.key);
          return next;
        });
        await reloadTranslations();
        toast(t('translation.ai_translated_success', 'Termo traduzido com sucesso.'));
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setTranslatingKeys((prev) => {
        const next = new Set(prev);
        next.delete(term.key);
        return next;
      });
    }
  };

  // Tradução em lote dos termos pendentes com IA
  const handleBatchAiTranslate = async () => {
    const pendingTerms = masterTerms.filter((term) => {
      const val =
        editingValues[term.key] !== undefined ? editingValues[term.key] : currentDict[term.key] || '';
      return !val || val.trim() === '';
    });

    if (pendingTerms.length === 0) {
      toast('Nenhum termo pendente para traduzir.');
      return;
    }

    setBatchTranslating(true);
    try {
      // Divide em lotes de 20 termos para não estourar tokens
      const chunkSize = 20;
      let totalTranslated = 0;
      for (let i = 0; i < pendingTerms.length; i += chunkSize) {
        const chunk = pendingTerms.slice(i, i + chunkSize);
        const res = await api.aiTranslate(
          selectedLang,
          chunk.map((t) => ({ key: t.key, text: t.text, context: t.context }))
        );
        if (res.translations && Object.keys(res.translations).length > 0) {
          await api.saveTranslations(selectedLang, res.translations);
          totalTranslated += Object.keys(res.translations).length;
          setEditingValues((prev) => ({ ...prev, ...res.translations }));
        }
      }
      await reloadTranslations();
      toast(
        t('translation.ai_translated_batch_success', { count: totalTranslated }) ||
          `${totalTranslated} termos traduzidos com Inteligência Artificial.`
      );
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBatchTranslating(false);
    }
  };

  // Adicionar novo idioma
  const handleAddLanguage = async () => {
    if (!candidateLang) return;
    try {
      await api.addLanguage(candidateLang);
      await reloadTranslations();
      setSelectedLang(candidateLang);
      setAddModalOpen(false);
      setCandidateLang('');
      toast('Novo idioma adicionado com sucesso.');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // Remover idioma
  const handleDeleteLanguage = async (lang) => {
    if (lang.code === DEFAULT_LANGUAGE) {
      toast(t('translation.pt_br_cannot_delete', 'O idioma Português (Brasil) é o padrão e não pode ser removido.'), 'error');
      return;
    }

    const ok = await confirm({
      title: 'Remover idioma',
      message: t('translation.delete_confirm', { name: lang.name }) || `Deseja remover o idioma "${lang.name}"? Todas as traduções personalizadas desse idioma serão excluídas.`,
      confirmText: 'Remover idioma',
      danger: true,
    });
    if (!ok) return;

    try {
      await api.removeLanguage(lang.code);
      await reloadTranslations();
      if (selectedLang === lang.code) {
        setSelectedLang(DEFAULT_LANGUAGE);
      }
      toast('Idioma removido com sucesso.');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // Consulta lista de modelos disponíveis no Groq
  const handleFetchModels = async (keyOverride) => {
    setLoadingModels(true);
    try {
      const res = keyOverride ? await api.fetchAiModelsWithKey(keyOverride) : await api.getAiModels();
      const list = res?.models || [];
      setAvailableModels(list);
      if (list.length > 0) {
        if (!selectedModel || !list.some((m) => m.id === selectedModel)) {
          const pref = list.find((m) => m.id === 'llama-3.1-8b-instant') || list[0];
          setSelectedModel(pref.id);
        }
      }
      return list;
    } catch (e) {
      toast(e.message, 'error');
      return [];
    } finally {
      setLoadingModels(false);
    }
  };

  // Salvar chave e provedor de IA
  const handleSaveAiKey = async (e) => {
    e.preventDefault();
    if (!aiKeyInput.trim()) return;
    setSavingAiKey(true);
    try {
      const keyVal = aiKeyInput.trim();
      await api.saveAiKey(keyVal, selectedProvider);
      setAiKeyInput('');
      setIsEditingAiKey(false);
      await reloadTranslations();
      toast(t('translation.ai_key_saved', 'Chave de Inteligência Artificial salva.'));

      // Dispara imediatamente consulta de modelos disponíveis para o usuário escolher
      const models = await handleFetchModels(keyVal);
      if (models.length > 0) {
        setIsEditingModel(true);
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSavingAiKey(false);
    }
  };

  // Iniciar alteração de modelo (dispara consulta aos modelos disponíveis)
  const handleStartEditModel = async () => {
    setIsEditingModel(true);
    const models = await handleFetchModels();
    if (models.length > 0 && aiModel) {
      setSelectedModel(aiModel);
    }
  };

  // Salvar modelo selecionado
  const handleSaveModel = async () => {
    if (!selectedModel) return;
    setSavingModel(true);
    try {
      await api.saveAiModel(selectedModel);
      await reloadTranslations();
      setIsEditingModel(false);
      toast(t('translation.ai_model_saved', 'Modelo de IA configurado com sucesso.'));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSavingModel(false);
    }
  };

  // Remover chave de IA com confirmação
  const handleDeleteAiKey = async () => {
    const ok = await confirm({
      title: 'Remover chave de API',
      message: 'Tem certeza que deseja remover a chave de API da Inteligência Artificial? A tradução com IA será pausada até a configuração de uma nova chave.',
      confirmText: 'Remover chave',
      danger: true,
    });
    if (!ok) return;

    try {
      await api.deleteAiKey();
      setIsEditingAiKey(false);
      setIsEditingModel(false);
      setAiKeyInput('');
      setSelectedModel('');
      setAvailableModels([]);
      await reloadTranslations();
      toast('Chave de API removida.');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // Exportar JSON
  const handleExportJson = () => {
    const url = api.getExportTranslationsUrl(selectedLang);
    window.open(url, '_blank');
  };

  // Importar JSON
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      let json = JSON.parse(text);
      if (json.translations && typeof json.translations === 'object') {
        json = json.translations;
      }
      const res = await api.importTranslations(selectedLang, json);
      await reloadTranslations();
      toast(
        t('translation.import_success', { count: res.count }) ||
          `Tradução importada com sucesso (${res.count} termos atualizados).`
      );
    } catch {
      toast(t('translation.import_error', 'Erro ao importar arquivo JSON: formato inválido.'), 'error');
    }
  };

  return (
    <div className="translation-tab-root">
      {/* Cabeçalho da seção com estatísticas e cards dos idiomas */}
      <section className="card">
        <div className="translation-header-row">
          <div>
            <h2>{t('translation.title', 'Gestão de Idiomas e Tradução')}</h2>
            <p className="muted">
              {t(
                'translation.subtitle',
                'Personalize os termos de interface por fábrica ou adicione novos idiomas com auxílio de Inteligência Artificial.'
              )}
            </p>
          </div>
          <div className="translation-header-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setCandidateLang(remainingLanguages[0]?.code || '');
                setAddModalOpen(true);
              }}
              disabled={remainingLanguages.length === 0}
            >
              <Icon name="plus" />
              <span>{t('translation.add_language', 'Adicionar idioma')}</span>
            </button>
            <button
              type="button"
              className={`btn ${aiConfigured ? 'ghost' : 'warn'}`}
              onClick={() => setAiCardOpen(!aiCardOpen)}
              title="Configurar chave para tradução com Inteligência Artificial"
            >
              <Icon name="gear" />
              <span>{aiConfigured ? 'Configuração IA' : 'Configurar IA'}</span>
            </button>
          </div>
        </div>

        {/* Configuração colapsável da Chave e Modelo de IA */}
        {aiCardOpen && (
          aiKeyMasked && !isEditingAiKey ? (
            <div className="ai-key-config-box">
              <div className="ai-key-header">
                <strong>{t('translation.ai_key_title', 'Configuração da Inteligência Artificial')}</strong>
                <small className="muted">
                  {t(
                    'translation.ai_key_configured_desc',
                    'Chave e modelo de Inteligência Artificial configurados e ativos para traduções instantâneas.'
                  )}
                </small>
              </div>

              {/* Linha 1: Chave de API */}
              <div className="ai-config-row">
                <span className="ai-row-label">Chave de API:</span>
                <select
                  className="ai-provider-select"
                  value={selectedProvider}
                  disabled
                  title="Provedor de IA selecionado"
                >
                  <option value="groq">Groq</option>
                </select>
                <div className="ai-key-masked-box" title="Chave de API configurada">
                  <span className="ai-key-masked-label">{aiKeyMasked}</span>
                </div>
                <button
                  type="button"
                  className="btn icon ghost"
                  onClick={() => {
                    setIsEditingAiKey(true);
                    setAiKeyInput('');
                  }}
                  title="Editar chave de API"
                  aria-label="Editar chave de API"
                >
                  <Icon name="edit" />
                </button>
                <button
                  type="button"
                  className="btn icon ghost danger"
                  onClick={handleDeleteAiKey}
                  title="Remover chave de API"
                  aria-label="Remover chave de API"
                >
                  <Icon name="trash" />
                </button>
              </div>

              {/* Linha 2: Modelo de IA */}
              <div className="ai-config-row">
                <span className="ai-row-label">{t('translation.ai_model_label', 'Modelo de IA:')}</span>
                {aiModel && !isEditingModel ? (
                  <>
                    <div className="ai-model-label-box" title="Modelo de Inteligência Artificial selecionado">
                      <span className="ai-model-label">{aiModel}</span>
                    </div>
                    <button
                      type="button"
                      className="btn icon ghost"
                      onClick={handleStartEditModel}
                      disabled={loadingModels}
                      title="Alterar modelo de IA"
                      aria-label="Alterar modelo de IA"
                    >
                      <Icon name="edit" />
                    </button>
                  </>
                ) : (
                  <div className="ai-model-edit-wrap">
                    <select
                      className="ai-model-select"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      disabled={loadingModels || savingModel}
                      title="Selecione o modelo desejado"
                    >
                      {loadingModels ? (
                        <option value="">Consultando modelos disponíveis no Groq…</option>
                      ) : availableModels.length === 0 ? (
                        <option value="">Nenhum modelo disponível retornado</option>
                      ) : (
                        availableModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.id} {m.owned_by ? `(${m.owned_by})` : ''}
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={handleSaveModel}
                      disabled={savingModel || loadingModels || !selectedModel}
                    >
                      {savingModel ? 'Salvando…' : t('translation.save_ai_model', 'Salvar modelo')}
                    </button>
                    {aiModel && (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setIsEditingModel(false)}
                        disabled={savingModel}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="ai-config-footer">
                <button
                  type="button"
                  className="btn ghost small-btn"
                  onClick={() => setAiCardOpen(false)}
                >
                  Fechar configuração
                </button>
              </div>
            </div>
          ) : (
            <form className="ai-key-config-box" onSubmit={handleSaveAiKey}>
              <div className="ai-key-header">
                <strong>{t('translation.ai_key_title', 'Chave de Acesso da Inteligência Artificial')}</strong>
                <small className="muted">
                  {t(
                    'translation.ai_key_desc',
                    'Informe sua chave para habilitar a tradução automatizada instantânea de termos.'
                  )}
                </small>
              </div>
              <div className="ai-key-input-row">
                <select
                  className="ai-provider-select"
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  title="Selecione o provedor de IA"
                >
                  <option value="groq">Groq</option>
                </select>
                <input
                  type="password"
                  className="ai-key-input"
                  placeholder={t('translation.ai_key_placeholder', 'Cole sua chave de API aqui…')}
                  value={aiKeyInput}
                  onChange={(e) => setAiKeyInput(e.target.value)}
                  autoComplete="off"
                />
                <button type="submit" className="btn primary" disabled={savingAiKey || !aiKeyInput.trim()}>
                  {savingAiKey ? 'Salvando…' : t('translation.save_ai_key', 'Salvar chave')}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setIsEditingAiKey(false);
                    setAiKeyInput('');
                    if (!aiKeyMasked) setAiCardOpen(false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )
        )}

        {/* Grid de idiomas disponíveis com porcentagem de conclusão */}
        <div className="languages-cards-grid">
          {availableLanguages.map((lang) => {
            const isSelected = lang.code === selectedLang;
            return (
              <div
                key={lang.code}
                className={`language-card-item ${isSelected ? 'is-active' : ''}`}
                onClick={() => setSelectedLang(lang.code)}
                role="button"
                tabIndex={0}
              >
                <div className="lang-card-head">
                  <span className="lang-card-flag">{lang.flag}</span>
                  <div className="lang-card-info">
                    <strong>{lang.name}</strong>
                    <small className="muted">{lang.code}</small>
                  </div>
                  {lang.code !== DEFAULT_LANGUAGE && (
                    <button
                      type="button"
                      className="btn icon ghost danger small-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLanguage(lang);
                      }}
                      title={t('translation.remove_language', 'Remover idioma')}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>

                <div className="lang-card-progress-wrap">
                  <div className="lang-progress-labels">
                    <small className="muted">{t('translation.completion_rate', 'Progresso')}</small>
                    <strong className={lang.percentage === 100 ? 'text-success' : ''}>
                      {lang.percentage}%
                    </strong>
                  </div>
                  <div className="lang-progress-bar">
                    <div
                      className={`lang-progress-fill ${lang.percentage === 100 ? 'complete' : ''}`}
                      style={{ width: `${lang.percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Seção de Gerenciamento e Tradução dos Termos do Idioma Selecionado */}
      <section className="card">
        <div className="terms-management-header">
          <div className="terms-header-title">
            <h3>
              <span>{currentLangInfo.flag}</span>
              <span>{currentLangInfo.name}</span>
              <span className="badge off">{stats.percentage}% traduzido</span>
            </h3>
            <p className="muted">
              {stats.completed} de {stats.total} termos traduzidos ({stats.pending} pendentes).
            </p>
          </div>

          <div className="terms-header-actions">
            {selectedLang !== DEFAULT_LANGUAGE && (
              <button
                type="button"
                className="btn primary"
                onClick={handleBatchAiTranslate}
                disabled={batchTranslating || stats.pending === 0}
                title="Traduzir todos os termos pendentes deste idioma com Inteligência Artificial"
              >
                <Icon name="sparkles" />
                <span>
                  {batchTranslating
                    ? t('translation.ai_translating', 'Traduzindo com IA…')
                    : `${t('translation.btn_translate_all_ai', 'Traduzir pendentes com IA')} (${stats.pending})`}
                </span>
              </button>
            )}

            <button
              type="button"
              className="btn"
              onClick={handleExportJson}
              title="Baixar arquivo JSON com as traduções deste idioma"
            >
              <Icon name="download" />
              <span>{t('translation.export_json', 'Exportar JSON')}</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="btn"
              onClick={() => fileInputRef.current?.click()}
              title="Carregar arquivo JSON para mesclar traduções"
            >
              <Icon name="upload" />
              <span>{t('translation.import_json', 'Importar JSON')}</span>
            </button>
          </div>
        </div>

        {/* Barra de Filtros e Busca de Termos */}
        <div className="terms-filter-bar">
          <div className="terms-search-wrap">
            <input
              type="search"
              placeholder={t('translation.search_placeholder', 'Buscar termo por chave, texto ou contexto…')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="seg" role="group" aria-label="Filtro de termos">
            <button
              type="button"
              className={`btn ${filterMode === 'all' ? 'active' : ''}`}
              onClick={() => setFilterMode('all')}
            >
              {t('common.all', 'Todos')} ({stats.total})
            </button>
            <button
              type="button"
              className={`btn ${filterMode === 'pending' ? 'active' : ''}`}
              onClick={() => setFilterMode('pending')}
            >
              Pendentes ({stats.pending})
            </button>
            <button
              type="button"
              className={`btn ${filterMode === 'completed' ? 'active' : ''}`}
              onClick={() => setFilterMode('completed')}
            >
              Traduzidos ({stats.completed})
            </button>
          </div>
        </div>

        {/* Tabela de Termos */}
        <div className="table-wrap tall">
          <table className="table translation-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>{t('translation.col_key', 'Identificador semântico')}</th>
                <th style={{ width: '22%' }}>{t('translation.col_source', 'Texto original (pt-BR)')}</th>
                <th style={{ width: '42%' }}>{t('translation.col_translation', 'Texto traduzido')}</th>
                <th style={{ width: '14%', textAlign: 'center' }}>{t('translation.col_actions', 'Ações')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTerms.map((term) => {
                const currentVal =
                  editingValues[term.key] !== undefined
                    ? editingValues[term.key]
                    : currentDict[term.key] || '';
                const isDirty = dirtyKeys.has(term.key);
                const isTranslating = translatingKeys.has(term.key);

                return (
                  <tr key={term.key} className={!currentVal ? 'row-pending' : ''}>
                    <td className="term-key-cell">
                      <code className="term-key-badge">{term.key}</code>
                      {term.context && <small className="term-context-hint">{term.context}</small>}
                    </td>
                    <td className="term-source-cell">
                      <span>{term.text}</span>
                    </td>
                    <td className="term-input-cell">
                      <div className="term-input-wrap">
                        <input
                          type="text"
                          className={`term-input ${isDirty ? 'is-dirty' : ''}`}
                          value={currentVal}
                          placeholder={
                            selectedLang === DEFAULT_LANGUAGE
                              ? term.text
                              : t('translation.input_placeholder', 'Digite a tradução aqui…')
                          }
                          onChange={(e) => handleInputChange(term.key, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveTerm(term.key);
                          }}
                        />
                      </div>
                    </td>
                    <td className="term-actions-cell">
                      <div className="term-actions-wrap">
                        {selectedLang !== DEFAULT_LANGUAGE && (
                          <button
                            type="button"
                            className="btn icon ghost"
                            onClick={() => handleAiTranslateSingle(term)}
                            disabled={isTranslating || batchTranslating}
                            title={t('translation.btn_translate_ai', 'Traduzir com IA')}
                          >
                            <Icon name="sparkles" size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          className={`btn small-btn ${isDirty ? 'primary' : 'ghost'}`}
                          onClick={() => handleSaveTerm(term.key)}
                          disabled={!isDirty}
                          title={t('common.save', 'Salvar')}
                        >
                          {t('common.save', 'Salvar')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredTerms.length === 0 && (
                <tr>
                  <td colSpan="4" className="empty-cell">
                    {t('translation.no_terms_found', 'Nenhum termo encontrado com os filtros aplicados.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal para Adicionar Novo Idioma */}
      {addModalOpen && (
        <Modal
          title={t('translation.select_lang_to_add', 'Adicionar novo idioma')}
          onClose={() => setAddModalOpen(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setAddModalOpen(false)}>
                {t('common.cancel', 'Cancelar')}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleAddLanguage}
                disabled={!candidateLang}
              >
                {t('translation.confirm_add', 'Adicionar')}
              </button>
            </>
          }
        >
          <div className="stack">
            <p className="muted">
              Selecione o idioma que deseja adicionar à fábrica. Ele começará com 0% e poderá ser traduzido
              manualmente ou com Inteligência Artificial.
            </p>
            <label className="field">
              Idioma
              <select
                value={candidateLang}
                onChange={(e) => setCandidateLang(e.target.value)}
                autoFocus
              >
                {remainingLanguages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
