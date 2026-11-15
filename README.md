# Mapa da fábrica · LOTO

Mapa 2D interativo da planta da fábrica para **rastrear bloqueios LOTO** (quem bloqueou, quando, histórico, KPIs).
**React + Node + SQLite, 100% offline.**

## Novidades (LOTO)

- **Registros de bloqueio com campos livres**: crie, renomeie e apague campos (Equipamento, Setor, Quem bloqueou, Data… ou quaisquer outros) em *Campos e KPIs*. Marque o *papel* dos campos que o sistema precisa entender (equipamento, setor, quem bloqueou, data de bloqueio, data de desbloqueio).
- **Importação de Excel que acrescenta**: *Importar Excel* lê um `.xlsx`, você relaciona cada coluna a um campo existente, cria campos novos ou ignora. Nada é substituído; linhas idênticas a registros existentes são ignoradas (opcional) e cada importação pode ser **desfeita**.
- **Cadeados no mapa**: em *Plantas e áreas*, selecione uma área, marque *Mostrar cadeado* e escreva o filtro dos registros dela:
  - área **macro**: `[Setor] == "Produção"` → o cadeado aparece se houver qualquer bloqueio ativo no setor e, ao clicar, lista todos os equipamentos bloqueados;
  - área de **detalhe**: `[Setor] == "Produção" and [Equipamento] == "Corte a laser"`.
  Você escolhe quais colunas aparecem ao clicar. O mapa se atualiza sozinho a cada 30 s.
- **Expressões estilo BI** (campos calculados, filtros, definição de "ativo", KPIs): `daysSince([Data de bloqueio]) > 7`, `oneOf([Setor], "A", "B")`, `if(cond, a, b)`… A ajuda fica no próprio campo, com teste ao vivo de quantos registros correspondem.
- **Dashboard**: bloqueios ativos, equipamentos bloqueados, mais antigo, tempo médio, KPIs personalizados, gráficos por grupo (escolha o campo), por mês, duração média, quem mais bloqueou.
- **Registros**: tabela com busca, filtro, ordenação, criar/editar/excluir e botão *Desbloquear*.

Um bloqueio é **ativo** enquanto o campo de papel "Data de desbloqueio" estiver vazio (ou conforme a expressão que você definir).


- **Visualização** (`/`): pan/zoom com mouse e toque (pinça), áreas clicáveis, animação de zoom até a área e transição para a imagem de detalhe, breadcrumb e botão de voltar (que "afasta" de volta para a área de origem).
- **Admin** (`/admin`): enviar/trocar imagens, desenhar áreas (polígono ou retângulo), ajustar vértices, mover áreas, definir nome, código, descrição, cor, opacidade, rótulo e **qual imagem abrir ao clicar**. Qualquer imagem pode ter áreas que levam a outras imagens (níveis ilimitados).

## Requisitos

Node.js 18 ou superior. A instalação das dependências (`npm install`) precisa de internet **uma vez**; depois disso o sistema roda sem rede nenhuma (sem CDN, fontes ou APIs externas).

## Desempenho (100 mil+ registros)

Os registros ficam num **cache em memória** que é montado uma vez e atualizado de forma incremental a cada edição. Mapa, dashboard, tabela e buscas respondem em poucos milissegundos mesmo com 100 mil registros (medido: mapa ≈ 15 ms, dashboard ≈ 2 ms, 10 TVs atualizando juntas ≈ 0,3 s no total). A primeira consulta depois de ligar o servidor monta o cache (≈ 1 s com 100 mil registros). Consumo de memória: ≈ 400 MB com 100 mil registros. A leitura de Excel é em *streaming* (arquivos de 100 mil linhas não estouram a memória), o backup e a exportação para Excel também não travam o sistema.

## Configurações (*Configurações*, só administrador)

- **Cor do cadeado pela idade do bloqueio**: faixas configuráveis (ex.: azul < 24 h, amarelo > 24 h, laranja > 72 h, vermelho > 7 dias). A cor segue o bloqueio ativo **mais antigo** da área; há legenda no mapa. Também define o prazo de **reincidência** (padrão 7 dias).
- **Backup automático**: ligar/desligar, diário em um horário ou a cada N horas, só dados ou dados + configurações, quantos guardar, **cópia para outra pasta** (rede/pendrive, com botão *Testar pasta*), estado do último e do próximo backup e *Fazer backup agora*.
- **Importação automática**: o sistema vigia uma pasta e importa cada `.xlsx` usando um perfil de importação (escolhido ou o que mais combina). Arquivos importados vão para `importados/` (ou são apagados), os problemáticos para `erros/` com o motivo no registro. Recusa arquivos cujas colunas combinem menos que o mínimo definido. Arquivos ainda sendo copiados (modificados há < 10 s) são aguardados.
- **Registro das tarefas automáticas** com o resultado de cada execução.

## Histórico por equipamento (aba *Histórico* do cadeado)

Ao clicar no cadeado há duas abas: **Bloqueios** (ativos, com a idade e a cor da faixa) e **Histórico**: KPIs do período, **equipamentos mais bloqueados**, **reincidência** (novo bloqueio em até N dias do desbloqueio anterior, com o tempo médio entre bloqueios) e **linha do tempo** por equipamento. O dashboard também mostra os mais bloqueados e a reincidência. Botão **PDF** na própria aba.

## Histórico de alterações dos registros

Cada criação, edição, desbloqueio e exclusão guarda quem fez, quando e o **valor antes e depois** de cada campo. Em *Registros*, o botão do relógio mostra o histórico do registro; *Alterações recentes* mostra o feed geral (inclusive exclusões). Registros importados mostram de qual arquivo vieram.

## Relatórios em PDF (*Relatórios*)

PDF A4 paisagem, prontos para imprimir: **Bloqueios ativos** (passagem de turno, com a idade colorida), **Histórico por período** (KPIs, rankings, reincidência e detalhamento; filtro por setor) e **Ficha da área/equipamento** (linha do tempo incluída). Você escolhe as colunas das tabelas.

## Login e perfis de acesso

No **primeiro acesso** o sistema pede para criar o administrador. Depois, em *Usuários*, o administrador cadastra as pessoas e escolhe o perfil:

| Perfil | O que pode |
|---|---|
| **Visualizador** | ver o mapa, os cadeados, o dashboard e os registros (somente leitura) |
| **Operador** | tudo acima + criar/editar registros, registrar desbloqueio, importar Excel e gerenciar perfis de importação |
| **Administrador** | tudo: plantas e áreas, campos, KPIs, usuários, backup e restauração |

- **Visão pública (opcional)**: para TVs/quiosques, *Usuários → Tela do mapa sem login* libera só o mapa, os cadeados e os bloqueios por área, em somente leitura. Todo o resto exige login.
- **Registro de atividades**: cada ação de alteração (quem, o quê, quando) fica gravada e aparece em *Usuários*. Os registros também guardam quem os lançou.
- **Esqueceu a senha do administrador?** No servidor: `npm run user -- admin NovaSenha123` (cria ou redefine, com perfil admin).
- Segurança: senhas com scrypt, sessão por cookie httpOnly (14 dias), bloqueio temporário após tentativas erradas. Se o acesso for por HTTP puro na rede interna, o tráfego não é criptografado; para algo mais exposto, coloque o sistema atrás de um proxy com HTTPS.

## Backup e restauração (*Backup*)

- **Somente dados**: registros e histórico de importações.
- **Dados + configurações**: tudo acima + plantas e imagens, áreas/cadeados, campos, KPIs, perfis de importação e ajustes. Opcionalmente inclui usuários (com senhas criptografadas).
- **Backup automático diário** (completo) em `server/data/backups/`, mantendo os últimos 14 (`BACKUP_KEEP` altera).
- **Restaurar**: de um arquivo `.zip` ou de um backup guardado no servidor. Backup de dados pode **substituir** ou **acrescentar** (sem duplicar). Antes de qualquer restauração o sistema cria sozinho um backup de segurança do estado atual.
- **Exportar registros (Excel)**: planilha com todos os registros e o estado de cada um.
- Para levar o sistema a outro computador: backup completo → instalar → restaurar.

## Importação diária: perfis de importação

Na etapa *Relacione as colunas*, salve o relacionamento como **perfil** (ex.: "Bloqueios diários"). O perfil guarda o mapeamento pelo **nome da coluna** (não pela posição) e a opção de ignorar repetidos. Nos próximos arquivos:

1. escolha o `.xlsx`; o sistema **aplica sozinho o perfil que mais combina** com as colunas;
2. se tudo foi reconhecido, o relacionamento já vem recolhido: basta clicar em **Importar**;
3. colunas novas no arquivo ou ausentes em relação ao perfil são avisadas.

Reimportar o mesmo arquivo não duplica nada, e campos criados por uma importação são reaproveitados nas seguintes.

## Como rodar

```bash
npm install
npm run seed     # opcional: cria uma planta de exemplo com um nível de detalhe
npm run dev      # desenvolvimento: web em http://localhost:5173, API em :3001
```

Produção (um único processo, serve a API e o site):

```bash
npm run build
npm start        # http://localhost:3001  (PORT=8080 npm start para trocar a porta)
```

O servidor escuta em `0.0.0.0`: tablets e celulares na mesma rede abrem `http://IP-DO-PC:3001`.

## Como usar o admin

1. **Enviar imagem** → planta geral (a primeira vira a tela inicial). Envie também as imagens de detalhe.
2. Escolha **Polígono** (toque para marcar cantos; toque no primeiro ponto ou em *Concluir* para fechar) ou **Retângulo** (dois toques nos cantos opostos).
3. Com a área selecionada: arraste os pontos para ajustar, arraste os pontos claros nas arestas para criar novos cantos, duplo clique/toque num ponto para removê-lo, arraste o corpo da área para movê-la.
4. No painel à direita, escolha **Ao clicar, abrir** a imagem de detalhe.
5. **Salvar**. Atalhos: `Esc` cancela, `Enter` fecha o polígono, `Backspace` remove o último ponto, `Delete` apaga a área.

## Estrutura

```
server/src/db.js      banco SQLite (better-sqlite3) + migrações por PRAGMA user_version
server/src/index.js   API REST, upload de imagens, serve client/dist
server/src/seed.js    dados de exemplo
server/data/          factory.db + uploads/  (faça backup copiando esta pasta)
client/src/hooks/usePanZoom.js   gestos de mouse/toque e animações
client/src/components/MapStage   imagem + camada SVG de áreas
client/src/components/Editor     editor de áreas do admin
client/src/pages/Viewer          tela de visualização e transição entre imagens
```

## API

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/login` · `/auth/logout` · `/auth/setup` | acesso |
| GET/POST/PATCH/DELETE | `/api/users` | usuários (admin) |
| GET/POST | `/api/backup/*`, `/api/export/records.xlsx` | backup, restauração, exportação |
| GET/POST/DELETE | `/api/import-profiles` | perfis de importação |
| GET/PUT | `/api/config` · POST `/api/jobs/backup/run`, `/api/jobs/import/run` | configurações e tarefas automáticas (admin) |
| GET | `/api/areas/:id/history`, `/api/records/:id/history`, `/api/history/recent` | histórico por equipamento e de alterações |
| GET | `/api/reports/active.pdf`, `/reports/period.pdf`, `/reports/area/:id.pdf` | relatórios em PDF |
| GET | `/api/maps` | lista plantas (com contagem de áreas) |
| GET | `/api/maps/root` | planta inicial + áreas |
| GET | `/api/maps/:id` | planta + áreas |
| POST | `/api/maps` | envia imagem (`multipart`: `image`, `name`) |
| PATCH | `/api/maps/:id` | `{ name }` e/ou `{ is_root: true }` |
| PUT | `/api/maps/:id/image` | troca a imagem (as áreas são mantidas) |
| PUT | `/api/maps/:id/areas` | substitui todas as áreas da planta |
| DELETE | `/api/maps/:id` | exclui planta e imagem |
| GET | `/api/maps/:id/lock-status` | bloqueios ativos por área com cadeado |
| GET | `/api/areas/:id/records` | registros da área (`?history=1` inclui encerrados) |
| GET/POST/PUT/DELETE | `/api/records` | registros de bloqueio |
| GET/POST/PATCH/DELETE | `/api/fields` | campos (livres, calculados, papéis) |
| GET/POST/PATCH/DELETE | `/api/kpis` | KPIs personalizados |
| POST | `/api/expr/test` | testa uma expressão |
| GET | `/api/stats` | números do dashboard |
| POST | `/api/import/preview`, `/api/import` | importação de Excel (acrescenta) |
| GET/DELETE | `/api/imports` | histórico / desfazer importação |

## Modelo de dados

- `maps(id, name, image, width, height, is_root, ...)`
- `areas(id, map_id, name, code, description, points, color, opacity, show_label, target_map_id, sort_order, lock_filter, show_lock, display_fields)`
- `users` · `sessions` · `audit_log` · `import_profiles` · `record_history` · `job_log`
- `fields(key, label, type, role, expr, visible, sort_order)` · `records(data JSON, hash, import_id)` · `imports` · `kpis` · `settings`

Os pontos são guardados **normalizados (0 a 1)**, então continuam corretos se a imagem for trocada por outra com resolução diferente (mas mesma proporção).

## Próximos passos

- Perfis de acesso personalizados (hoje são 3 fixos).
