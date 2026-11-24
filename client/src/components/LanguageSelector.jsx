import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n/I18nContext.jsx';
import Icon from './Icons.jsx';

export default function LanguageSelector() {
  const { currentLanguage, availableLanguages, language, setLanguage } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Se não houver idiomas além do padrão e nenhuma lista disponível, ainda exibe o botão
  const languagesList = availableLanguages.length > 0 ? availableLanguages : [currentLanguage];

  return (
    <div className="language-selector-wrap" ref={ref}>
      <button
        type="button"
        className="btn icon language-btn"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={`Idioma: ${currentLanguage.name}`}
        aria-label={`Idioma atual: ${currentLanguage.name}. Clique para alternar.`}
      >
        <span className="lang-flag-current" aria-hidden="true">
          {currentLanguage.flag}
        </span>
      </button>

      {open && (
        <div className="language-dropdown-menu" role="listbox" aria-label="Selecione o idioma">
          <div className="language-dropdown-header">
            <small>Idiomas</small>
          </div>
          {languagesList.map((lang) => {
            const isSelected = lang.code === language;
            return (
              <button
                key={lang.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`language-option-item ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  setLanguage(lang.code);
                  setOpen(false);
                }}
              >
                <span className="lang-option-flag" aria-hidden="true">
                  {lang.flag}
                </span>
                <span className="lang-option-name">{lang.name}</span>
                {lang.code !== 'pt-BR' && lang.percentage !== undefined && (
                  <span className={`badge ${lang.percentage === 100 ? 'off' : 'warn'}`}>
                    {lang.percentage}%
                  </span>
                )}
                {isSelected && (
                  <span className="lang-option-check" aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
