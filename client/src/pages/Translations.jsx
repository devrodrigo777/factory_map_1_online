import Shell from '../components/Shell.jsx';
import TranslationTab from '../components/TranslationTab.jsx';
import { useTranslation } from '../i18n/I18nContext.jsx';

export default function Translations() {
  const { t } = useTranslation();
  return (
    <Shell title={t('translation.title', 'Tradução')}>
      <div className="page">
        <TranslationTab />
      </div>
    </Shell>
  );
}
