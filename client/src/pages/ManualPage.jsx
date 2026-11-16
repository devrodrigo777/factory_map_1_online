import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icons.jsx';

const SECTIONS = [
  {
    category: 'CADEADO',
    badgeClass: 'badge-blue',
    title: 'Filtro de Cadeado LOTOTO da Área',
    signature: '[equipamento] == "TAG" && isEmpty([data_desbloqueio])',
    description: 'Expressão booleana avaliada em cada registro. Se retornar verdadeiro, o cadeado LOTOTO é desenhado no mapa sobre a área demarcada.',
    context: 'Plantas e áreas -> Selecionar área -> Cadeado (LOTOTO) -> Expressão',
    params: [
      { name: '[campo]', type: 'String/Número', desc: 'Nome ou chave do campo entre colchetes (ex: [equipamento], [setor]).' },
      { name: 'isEmpty(...)', type: 'Função', desc: 'Garante que o cadeado só apareça se a data de desbloqueio estiver vazia.' },
    ],
    example: '[equipamento] == "Prensa Hidráulica 01" && isEmpty([data_desbloqueio])',
    returns: 'Booleano (true ativa o cadeado, false oculta)',
  },
  {
    category: 'CADEADO',
    badgeClass: 'badge-blue',
    title: 'Filtro por Setor ou Múltiplos Equipamentos',
    signature: 'oneOf([equipamento], "Torno 01", "Torno 02") && ativo',
    description: 'Projeta o cadeado quando qualquer uma das máquinas daquela célula de trabalho estiver com bloqueio ativo.',
    context: 'Plantas e áreas -> Cadeado (LOTOTO)',
    params: [
      { name: 'oneOf(...)', type: 'Função', desc: 'Retorna verdadeiro se o equipamento corresponder a qualquer item da lista.' },
      { name: 'ativo', type: 'Variável', desc: 'Verifica automaticamente se o registro está ativo no sistema.' },
    ],
    example: 'oneOf([equipamento], "Torno 01", "Torno 02", "Fresadora 01") && ativo',
    returns: 'Booleano',
  },
  {
    category: 'KPI',
    badgeClass: 'badge-amber',
    title: 'KPI: Bloqueios Ativos Há Mais de 24 Horas',
    signature: 'ativo && hoursSince([data_bloqueio]) > 24',
    description: 'Métrica exibida no Dashboard que conta quantas intervenções ativas ultrapassaram 24 horas de duração.',
    context: 'Campos e KPIs -> Guia KPIs -> Novo KPI',
    params: [
      { name: 'ativo', type: 'Booleano', desc: 'Filtra somente registros atualmente em aberto.' },
      { name: 'hoursSince(...)', type: 'Função', desc: 'Calcula o número de horas corridas desde a data de bloqueio até o momento atual.' },
    ],
    example: 'ativo && hoursSince([data_bloqueio]) > 24',
    returns: 'Booleano (o KPI soma automaticamente a quantidade de registros verdadeiros)',
  },
  {
    category: 'KPI',
    badgeClass: 'badge-amber',
    title: 'KPI: Bloqueios Sem Justificativa / Motivo',
    signature: 'ativo && isEmpty([motivo])',
    description: 'Audita a qualidade do preenchimento das ordens, contabilizando bloqueios ativos onde o campo Motivo foi deixado em branco.',
    context: 'Campos e KPIs -> Guia KPIs -> Novo KPI',
    params: [
      { name: 'isEmpty(...)', type: 'Função', desc: 'Detecta valores nulos, vazios ou não preenchidos.' },
    ],
    example: 'ativo && isEmpty([motivo])',
    returns: 'Booleano (contador de linhas)',
  },
  {
    category: 'CAMPO',
    badgeClass: 'badge-purple',
    title: 'Campo Calculado: Dias em Aberto / Duração',
    signature: 'if(isEmpty([data_desbloqueio]), round(daysSince([data_bloqueio]), 1), round(diffDays([data_bloqueio], [data_desbloqueio]), 1))',
    description: 'Gera uma coluna calculada dinâmica: se o bloqueio ainda estiver ativo, mostra quantos dias se passaram; se já foi encerrado, calcula a duração total.',
    context: 'Campos e KPIs -> Guia Campos -> Criar/Editar campo -> Expressão calculada',
    params: [
      { name: 'if(cond, a, b)', type: 'Função', desc: 'Se a condição for verdadeira retorna "a", senão retorna "b".' },
      { name: 'round(n, 1)', type: 'Função', desc: 'Arredonda o resultado para uma casa decimal.' },
    ],
    example: 'if(isEmpty([data_desbloqueio]), round(daysSince([data_bloqueio]), 1), round(diffDays([data_bloqueio], [data_desbloqueio]), 1))',
    returns: 'Número (dias)',
  },
  {
    category: 'TEXTO',
    badgeClass: 'badge-green',
    title: 'isEmpty(x) / vazio(x)',
    signature: 'isEmpty([campo])',
    description: 'Retorna verdadeiro se o campo for nulo, indefinido ou texto em branco. Essencial para verificar se a data de desbloqueio foi preenchida.',
    context: 'Filtros, KPIs e Campos Calculados',
    params: [{ name: 'x', type: 'Qualquer', desc: 'Campo ou expressão a ser testada.' }],
    example: 'isEmpty([data_desbloqueio])',
    returns: 'Booleano (true se vazio, false caso contrário)',
  },
  {
    category: 'TEXTO',
    badgeClass: 'badge-green',
    title: 'contains(a, b) / contem(a, b)',
    signature: 'contains([campo], "termo")',
    description: 'Verifica se o texto "a" contém o trecho "b". Ignora maiúsculas, minúsculas e acentuações.',
    context: 'Filtros de Área e KPIs',
    params: [
      { name: 'a', type: 'Texto', desc: 'Texto de origem ou campo (ex: [equipamento]).' },
      { name: 'b', type: 'Texto', desc: 'Termo a ser procurado (ex: "Prensa").' },
    ],
    example: 'contains([equipamento], "Prensa") && ativo',
    returns: 'Booleano',
  },
  {
    category: 'TEXTO',
    badgeClass: 'badge-green',
    title: 'oneOf(x, a, b, c...)',
    signature: 'oneOf([setor], "Usinagem", "Laminação", "Montagem")',
    description: 'Retorna verdadeiro se o valor de "x" for idêntico a qualquer um dos itens informados na sequência.',
    context: 'Filtros e KPIs',
    params: [
      { name: 'x', type: 'Texto/Número', desc: 'Campo a testar.' },
      { name: 'a, b, c...', type: 'Literais', desc: 'Valores admitidos.' },
    ],
    example: 'oneOf([setor], "Setor A", "Setor B") && ativo',
    returns: 'Booleano',
  },
  {
    category: 'DATA',
    badgeClass: 'badge-cyan',
    title: 'daysSince(data) / diasDesde(data)',
    signature: 'daysSince([data_bloqueio])',
    description: 'Calcula o número fracionário de dias corridos desde a data informada até o momento atual.',
    context: 'Campos calculados e KPIs de envelhecimento',
    params: [{ name: 'data', type: 'Data', desc: 'Campo do tipo data (ex: [data_bloqueio]).' }],
    example: 'round(daysSince([data_bloqueio]), 1)',
    returns: 'Número (dias decorridos)',
  },
  {
    category: 'DATA',
    badgeClass: 'badge-cyan',
    title: 'hoursSince(data) / horasDesde(data)',
    signature: 'hoursSince([data_bloqueio])',
    description: 'Calcula o total de horas decorridas desde o momento do bloqueio até agora.',
    context: 'KPIs e relatórios de turno',
    params: [{ name: 'data', type: 'Data', desc: 'Data/hora de bloqueio.' }],
    example: 'hoursSince([data_bloqueio]) > 12 && ativo',
    returns: 'Número (horas decorridas)',
  },
  {
    category: 'DATA',
    badgeClass: 'badge-cyan',
    title: 'diffDays(dataInicio, dataFim) / diffHours(...)',
    signature: 'diffDays([data_bloqueio], [data_desbloqueio])',
    description: 'Calcula a diferença exata em dias ou em horas entre duas datas fornecidas.',
    context: 'Campos calculados de tempo total de manutenção',
    params: [
      { name: 'dataInicio', type: 'Data', desc: 'Momento de aplicação do bloqueio.' },
      { name: 'dataFim', type: 'Data', desc: 'Momento de desbloqueio / liberação.' },
    ],
    example: 'round(diffHours([data_bloqueio], [data_desbloqueio]), 1)',
    returns: 'Número (dias ou horas)',
  },
  {
    category: 'LÓGICA',
    badgeClass: 'badge-purple',
    title: 'if(condicao, valorSeVerdadeiro, valorSeFalso)',
    signature: 'if([qtd_cadeados] > 1, "Múltiplo", "Simples")',
    description: 'Avalia uma condição lógica e retorna o primeiro valor caso seja verdadeira, ou o segundo caso seja falsa.',
    context: 'Campos Calculados',
    params: [
      { name: 'condicao', type: 'Booleano', desc: 'Teste lógico (ex: ativo, [qtd] > 5).' },
      { name: 'valorSeVerdadeiro', type: 'Qualquer', desc: 'Resultado quando verdadeiro.' },
      { name: 'valorSeFalso', type: 'Qualquer', desc: 'Resultado quando falso.' },
    ],
    example: 'if(ativo, "BLOQUEIO ATIVO", "LIBERADO")',
    returns: 'Texto ou Número correspondente',
  },
  {
    category: 'IMPORT',
    badgeClass: 'badge-teal',
    title: 'Importação Externa (SAP, Excel, Poka)',
    signature: 'Mapeamento de Planilhas .xlsx e .csv',
    description: 'Permite carregar ordens de bloqueio de sistemas externos como SAP, Poka ou planilhas Excel. O sistema previne duplicações automáticas por hash e permite salvar perfis reutilizáveis.',
    context: 'Menu superior -> Importar',
    params: [
      { name: 'Perfis Salvos', type: 'Configuração', desc: 'Associe as colunas da planilha aos campos LOTOTO uma única vez e salve o perfil.' },
      { name: 'Desfazer Importação', type: 'Auditoria', desc: 'Cada lote importado pode ser revertido com segurança caso haja inconsistência.' },
    ],
    example: 'Carregue a planilha semanal do SAP e aplique o perfil salvo "SAP Manutenção Semanal".',
    returns: 'Gravação em lote com integridade',
  },
  {
    category: 'SEGURANÇA',
    badgeClass: 'badge-red',
    title: 'Acesso Seguro de Contingência',
    signature: 'Login: recovery | Senha: (Padrão do Sistema)',
    description: 'Conta administradora oculta e protegida contra exclusão/alteração. Permite restabelecer o acesso ao sistema caso a senha do administrador seja esquecida.',
    context: 'Tela de Login',
    params: [
      { name: 'recovery', type: 'Usuário', desc: 'Login reservado pelo sistema com permissões totais de admin.' },
      { name: '1234Abcd', type: 'Senha', desc: 'Senha padrão de contingência mantida sob custódia.' },
    ],
    example: 'Em caso de emergência, faça login com "recovery" e acerte as senhas dos colaboradores na aba Usuários.',
    returns: 'Acesso imediato de Administrador',
  },
];

export default function ManualPage() {
  const [filter, setFilter] = useState('');
  const [selectedCat, setSelectedCat] = useState('TODOS');
  const [openItems, setOpenItems] = useState({});
  const [copiedIndex, setCopiedIndex] = useState(null);

  const categories = ['TODOS', 'CADEADO', 'KPI', 'CAMPO', 'TEXTO', 'DATA', 'LÓGICA', 'IMPORT', 'SEGURANÇA'];

  const toggleItem = (idx) => {
    setOpenItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const copyExample = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const filteredItems = useMemo(() => {
    return SECTIONS.filter((item) => {
      const matchCat = selectedCat === 'TODOS' || item.category === selectedCat;
      const q = filter.trim().toLowerCase();
      const matchText =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.signature.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q);
      return matchCat && matchText;
    });
  }, [filter, selectedCat]);

  return (
    <div className="swagger-page">
      {/* Topo Swagger Style */}
      <header className="swagger-topbar">
        <div className="swagger-brand">
          <div className="swagger-logo-circle">
            <Icon name="lock" size={18} />
          </div>
          <div className="swagger-brand-info">
            <h1>EasyLOTOTO for Knauf</h1>
            <span className="swagger-tag-version">v2.0 OAS-UI</span>
          </div>
        </div>

        <div className="swagger-topbar-actions">
          <a
            href="/easylototo-skill.md"
            download="easylototo-skill.md"
            className="swagger-btn-action swagger-btn-skill"
            title="Baixar arquivo markdown estruturado para carregar no ChatGPT, Claude ou Gemini"
          >
            <Icon name="swap" size={15} />
            <span>Baixar versão otimizada para IA (.md)</span>
          </a>

          <a
            href="/Manual_de_Uso_EasyLOTOTO_for_Knauf.pdf"
            download="Manual_de_Uso_EasyLOTOTO_for_Knauf.pdf"
            className="swagger-btn-action swagger-btn-pdf"
            title="Baixar manual completo em PDF para impressão"
          >
            <Icon name="file" size={15} />
            <span>Manual em PDF</span>
          </a>

          <Link to="/login" className="swagger-btn-action swagger-btn-back">
            <Icon name="back" size={15} />
            <span>Voltar</span>
          </Link>
        </div>
      </header>

      {/* Hero / Info Swagger Banner */}
      <div className="swagger-hero">
        <div className="swagger-hero-content">
          <div className="swagger-hero-title-row">
            <h2>Manual de Uso e Referência Interativa de Expressões</h2>
            <span className="swagger-badge-status">Offline Engine • v2.0</span>
          </div>
          <p className="swagger-hero-desc">
            Sistema simples para gestão visual de bloqueios e etiquetagens de energia perigosa (LOTOTO) da fábrica.
            Consulte abaixo a documentação interativa de funções, filtros de cadeado de áreas e fórmulas de KPIs.
          </p>

          <div className="swagger-credits-box">
            <div>
              <strong>Idealizado por:</strong> Hadmilton de Melos Cordeiro{' '}
              <em>(Coordenador de Manutenção Mecânica / Supervisor de Estágio)</em>
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>Desenvolvimento e implementação:</strong> Rodrigo Lopes Chaves de Aguiar{' '}
              <em>(Estagiário de Engenharia de Software)</em>
            </div>
          </div>
        </div>
      </div>

      {/* Caixa de Destaque para Download de IA */}
      <div className="swagger-ai-card">
        <div className="swagger-ai-card-content">
          <div className="swagger-ai-card-icon">
            <Icon name="swap" size={24} />
          </div>
          <div>
            <h3>Utilize esta documentação diretamente com sua IA favorita</h3>
            <p>
              O arquivo <code>easylototo-skill.md</code> contém toda a semântica, regras, o que pode e o que não pode do
              EasyLOTOTO for Knauf. Carregue-o como instrução no ChatGPT, Claude ou Gemini para criar novos KPIs e campos calculados sob medida.
            </p>
          </div>
        </div>
        <a
          href="/easylototo-skill.md"
          download="easylototo-skill.md"
          className="swagger-btn-download-ai"
        >
          <Icon name="upload" size={16} /> Baixar easylototo-skill.md
        </a>
      </div>

      {/* Filtros e Barra de Pesquisa Swagger */}
      <div className="swagger-filter-bar">
        <div className="swagger-search-box">
          <Icon name="search" size={16} />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por função, operador, comando ou conceito (ex: isEmpty, cadeado, kpi, sap)..."
          />
          {filter && (
            <button type="button" className="swagger-clear-search" onClick={() => setFilter('')}>
              ×
            </button>
          )}
        </div>

        <div className="swagger-category-pills">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`swagger-pill ${selectedCat === cat ? 'active' : ''}`}
              onClick={() => setSelectedCat(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Operações Swagger / Acordeões */}
      <div className="swagger-operations-list">
        {filteredItems.length === 0 ? (
          <div className="swagger-empty">
            <p>Nenhuma operação ou função encontrada para o filtro informado.</p>
          </div>
        ) : (
          filteredItems.map((item, idx) => {
            const isOpen = openItems[idx] ?? true;
            return (
              <div key={idx} className={`swagger-op-card ${item.badgeClass} ${isOpen ? 'open' : 'closed'}`}>
                <div className="swagger-op-header" onClick={() => toggleItem(idx)}>
                  <span className="swagger-method-badge">{item.category}</span>
                  <span className="swagger-signature-code">{item.signature}</span>
                  <span className="swagger-op-title">{item.title}</span>
                  <span className="swagger-arrow-icon">{isOpen ? '▼' : '►'}</span>
                </div>

                {isOpen && (
                  <div className="swagger-op-body">
                    <p className="swagger-op-desc">{item.description}</p>

                    {item.context && (
                      <div className="swagger-meta-row">
                        <strong>Onde Aplicar:</strong> <code>{item.context}</code>
                      </div>
                    )}

                    {item.params && item.params.length > 0 && (
                      <div className="swagger-params-section">
                        <h4>Parâmetros da Operação:</h4>
                        <table className="swagger-params-table">
                          <thead>
                            <tr>
                              <th>Parâmetro</th>
                              <th>Tipo</th>
                              <th>Descrição</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.params.map((p, pi) => (
                              <tr key={pi}>
                                <td><code>{p.name}</code></td>
                                <td><span className="swagger-type-tag">{p.type}</span></td>
                                <td>{p.desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="swagger-example-section">
                      <div className="swagger-example-header">
                        <h4>Exemplo Pronto para Uso:</h4>
                        <button
                          type="button"
                          className="swagger-btn-copy"
                          onClick={() => copyExample(item.example, idx)}
                        >
                          {copiedIndex === idx ? '✓ Copiado!' : 'Copiar Expressão'}
                        </button>
                      </div>
                      <pre className="swagger-code-block">{item.example}</pre>
                      <div className="swagger-return-row">
                        <strong>Retorno Esperado:</strong> {item.returns}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Rodapé Swagger */}
      <footer className="swagger-footer">
        <p>
          EasyLOTOTO for Knauf • Gestão Visual de Bloqueios e Etiquetagens LOTOTO na Fábrica.
        </p>
      </footer>
    </div>
  );
}
