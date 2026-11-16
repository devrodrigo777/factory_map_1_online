// Script oficial de compilação do Manual de Uso do EasyLOTOTO v2 em PDF.
// Executado com: node server/src/generate_manual_pdf.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultOutputPath = path.resolve(here, '../../Manual_de_Uso_EasyLOTOTO_for_Knauf.pdf');
let outputPath = defaultOutputPath;

try {
  if (fs.existsSync(outputPath)) {
    const fd = fs.openSync(outputPath, 'r+');
    fs.closeSync(fd);
  }
} catch (e) {
  if (e.code === 'EBUSY') {
    outputPath = path.resolve(here, '../../Manual_de_Uso_EasyLOTOTO_for_Knauf_atualizado.pdf');
    console.log(`Nota: Arquivo original aberto em outro aplicativo. Gerando em: ${outputPath}`);
  }
}

// Paleta visual técnica industrial
const C = {
  NAVY: '#0B132B',
  BLUE_DARK: '#1C2541',
  BLUE_PRIMARY: '#2563EB',
  BLUE_LIGHT: '#EFF6FF',
  ORANGE_SIGNAL: '#EA580C',
  ORANGE_LIGHT: '#FFF7ED',
  GRAY_BG: '#F8FAFC',
  GRAY_BOX: '#F1F5F9',
  GRAY_BORDER: '#CBD5E1',
  GRAY_LINE: '#E2E8F0',
  TEXT_TITLE: '#0F172A',
  TEXT_BODY: '#334155',
  TEXT_MUTED: '#64748B',
  WHITE: '#FFFFFF',
  GREEN_SUCCESS: '#16A34A',
  GREEN_LIGHT: '#F0FDF4',
  RED_DANGER: '#DC2626',
  RED_LIGHT: '#FEF2F2',
  CODE_BG: '#0F172A',
  CODE_TEXT: '#38BDF8',
};

const M = 40; // Margem lateral
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - M * 2;
const BOTTOM_LIMIT = PAGE_H - 52;
const TOP_MARGIN = 50;

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: TOP_MARGIN, bottom: 50, left: M, right: M },
  bufferPages: true,
  autoFirstPage: true,
  info: {
    Title: 'Manual de Uso do EasyLOTOTO for Knauf',
    Author: 'EasyLOTOTO for Knauf',
    Subject: 'Manual Técnico de Operação e Uso do Sistema',
    Keywords: 'EasyLOTOTO, Knauf, LOTOTO, Manual, Bloqueio, Etiquetagem',
    CreationDate: new Date(),
  },
});

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// Armazena mapeamento de capítulos para o sumário dinâmico
const chapterRegistry = [];

function checkSpace(neededHeight) {
  if (doc.y + neededHeight > BOTTOM_LIMIT) {
    doc.addPage();
    doc.y = TOP_MARGIN;
  }
}

function startChapter(number, title, subtitle) {
  doc.addPage();
  doc.y = TOP_MARGIN;
  const pageNum = doc.bufferedPageRange().count;
  chapterRegistry.push({ number, title, subtitle, pageNum });

  const y = doc.y;
  // Bloco decorativo do cabeçalho do capítulo
  doc.rect(M, y, 6, 36).fill(C.BLUE_PRIMARY);

  doc.font('Helvetica-Bold').fontSize(14).fillColor(C.TEXT_TITLE);
  doc.text(`Capítulo ${number}: ${title}`, M + 14, y + 2, { width: CONTENT_W - 14 });

  if (subtitle) {
    doc.font('Helvetica').fontSize(9).fillColor(C.TEXT_MUTED);
    doc.text(subtitle, M + 14, doc.y + 2, { width: CONTENT_W - 14 });
  }

  const lineY = Math.max(doc.y + 6, y + 40);
  doc.moveTo(M, lineY).lineTo(PAGE_W - M, lineY).lineWidth(0.8).strokeColor(C.GRAY_LINE).stroke();
  doc.y = lineY + 12;
}

function drawSubSection(title) {
  checkSpace(36);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.BLUE_DARK);
  doc.text(title, M, doc.y + 4, { width: CONTENT_W });
  doc.y += 4;
}

function drawParagraph(text, options = {}) {
  const h = doc.heightOfString(text, { width: CONTENT_W, lineGap: 3 });
  checkSpace(h + 8);
  doc.font('Helvetica').fontSize(9.2).fillColor(C.TEXT_BODY);
  doc.text(text, M, doc.y, { width: CONTENT_W, lineGap: 3, align: options.align || 'justify' });
  doc.y += options.spacing ?? 6;
}

function drawBullet(title, text) {
  const bulletPrefix = '•  ';
  const fullText = (title ? `${title}: ` : '') + text;
  const h = doc.heightOfString(fullText, { width: CONTENT_W - 16, lineGap: 2 });
  checkSpace(h + 6);

  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ORANGE_SIGNAL).text(bulletPrefix, M + 4, y, { lineBreak: false });

  if (title) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.TEXT_TITLE).text(`${title}: `, M + 16, y, { lineBreak: false });
    const titleW = doc.widthOfString(`${title}: `);
    doc.font('Helvetica').fontSize(9).fillColor(C.TEXT_BODY).text(text, M + 16 + titleW, y, { width: CONTENT_W - 16 - titleW, lineGap: 2 });
  } else {
    doc.font('Helvetica').fontSize(9).fillColor(C.TEXT_BODY).text(text, M + 16, y, { width: CONTENT_W - 16, lineGap: 2 });
  }
  doc.y += 4;
}

function drawCallout(type, title, text) {
  const styles = {
    info: { border: C.BLUE_PRIMARY, bg: C.BLUE_LIGHT, text: C.BLUE_DARK, badge: 'INFORMAÇÃO' },
    tip: { border: C.GREEN_SUCCESS, bg: C.GREEN_LIGHT, text: C.TEXT_BODY, badge: 'DICA DE USO' },
    warning: { border: C.ORANGE_SIGNAL, bg: C.ORANGE_LIGHT, text: C.TEXT_BODY, badge: 'ATENÇÃO' },
    danger: { border: C.RED_DANGER, bg: C.RED_LIGHT, text: C.TEXT_BODY, badge: 'CONTINGÊNCIA' },
  };
  const s = styles[type] || styles.info;
  const boxW = CONTENT_W;
  const textH = doc.heightOfString(text, { width: boxW - 24, lineGap: 2 });
  const totalH = textH + 26;

  checkSpace(totalH + 8);
  const y = doc.y;

  doc.roundedRect(M, y, boxW, totalH, 4).fill(s.bg);
  doc.roundedRect(M, y, 4, totalH, 2).fill(s.border);
  doc.roundedRect(M, y, boxW, totalH, 4).lineWidth(0.5).strokeColor(C.GRAY_BORDER).stroke();

  doc.font('Helvetica-Bold').fontSize(8).fillColor(s.border);
  doc.text(`${s.badge}: ${title.toUpperCase()}`, M + 14, y + 7, { width: boxW - 28 });

  doc.font('Helvetica').fontSize(8.5).fillColor(s.text);
  doc.text(text, M + 14, y + 18, { width: boxW - 28, lineGap: 2 });

  doc.y = y + totalH + 8;
}

function drawTable(headers, rows, colWidths) {
  const totalW = CONTENT_W;
  const rowPad = 4;
  const headerH = 18;

  checkSpace(headerH + 22);

  let curY = doc.y;
  doc.rect(M, curY, totalW, headerH).fill(C.NAVY);

  let curX = M;
  headers.forEach((h, i) => {
    const w = colWidths[i];
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.WHITE);
    doc.text(h, curX + rowPad, curY + 5, { width: w - rowPad * 2, ellipsis: true });
    curX += w;
  });

  curY += headerH;

  rows.forEach((r, ri) => {
    let maxCellH = 13;
    r.forEach((cell, ci) => {
      const cellH = doc.heightOfString(String(cell), { width: colWidths[ci] - rowPad * 2, lineGap: 1 });
      if (cellH > maxCellH) maxCellH = cellH;
    });
    const lineH = maxCellH + rowPad * 2;

    if (curY + lineH > BOTTOM_LIMIT) {
      doc.addPage();
      curY = TOP_MARGIN;
      doc.rect(M, curY, totalW, headerH).fill(C.NAVY);
      let hX = M;
      headers.forEach((h, i) => {
        const w = colWidths[i];
        doc.font('Helvetica-Bold').fontSize(8).fillColor(C.WHITE);
        doc.text(h, hX + rowPad, curY + 5, { width: w - rowPad * 2, ellipsis: true });
        hX += w;
      });
      curY += headerH;
    }

    if (ri % 2 === 1) {
      doc.rect(M, curY, totalW, lineH).fill(C.GRAY_BG);
    }
    doc.moveTo(M, curY + lineH).lineTo(M + totalW, curY + lineH).lineWidth(0.4).strokeColor(C.GRAY_LINE).stroke();

    let cellX = M;
    r.forEach((cell, ci) => {
      const w = colWidths[ci];
      doc.font('Helvetica').fontSize(8).fillColor(C.TEXT_BODY);
      doc.text(String(cell), cellX + rowPad, curY + rowPad, { width: w - rowPad * 2, lineGap: 1 });
      cellX += w;
    });

    curY += lineH;
  });

  doc.rect(M, doc.y, totalW, curY - doc.y).lineWidth(0.6).strokeColor(C.GRAY_BORDER).stroke();
  doc.y = curY + 8;
}

function drawCodeSnippet(title, code) {
  const h = doc.heightOfString(code, { width: CONTENT_W - 24, lineGap: 2 });
  checkSpace(h + 28);
  const y = doc.y;

  doc.roundedRect(M, y, CONTENT_W, h + 22, 4).fill(C.CODE_BG);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.TEXT_MUTED);
  doc.text(title.toUpperCase(), M + 12, y + 5);

  doc.font('Courier').fontSize(8).fillColor(C.CODE_TEXT);
  doc.text(code, M + 12, y + 16, { width: CONTENT_W - 24, lineGap: 2 });

  doc.y = y + h + 28;
}

function drawStepWorkflow(steps) {
  checkSpace(65);
  const gap = 8;
  const count = steps.length;
  const boxW = (CONTENT_W - gap * (count - 1)) / count;
  const boxH = 48;
  const y = doc.y;

  steps.forEach((step, idx) => {
    const x = M + idx * (boxW + gap);
    doc.roundedRect(x, y, boxW, boxH, 4).fill(C.GRAY_BOX).strokeColor(C.GRAY_BORDER).lineWidth(0.6).stroke();

    doc.roundedRect(x + 6, y + 6, 16, 14, 2).fill(C.BLUE_PRIMARY);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.WHITE).text(String(idx + 1), x + 6, y + 9, { width: 16, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.TEXT_TITLE).text(step.title, x + 26, y + 8, { width: boxW - 30, lineBreak: false, ellipsis: true });
    doc.font('Helvetica').fontSize(7.5).fillColor(C.TEXT_BODY).text(step.desc, x + 6, y + 23, { width: boxW - 12, lineGap: 1 });
  });

  doc.y = y + boxH + 10;
}

// =========================================================================
// 1. CAPA (SEM FRASES DE EFEITO, COM CRÉDITOS CLAROS NO RODAPÉ)
// =========================================================================
function buildCoverPage() {
  doc.rect(0, 0, PAGE_W, 200).fill(C.NAVY);
  doc.rect(0, 195, PAGE_W, 5).fill(C.ORANGE_SIGNAL);

  doc.font('Helvetica-Bold').fontSize(30).fillColor(C.WHITE);
  doc.text('EasyLOTOTO for Knauf', M, 65);

  doc.font('Helvetica').fontSize(13.5).fillColor('#94A3B8');
  doc.text('Manual de Uso do EasyLOTOTO for Knauf — Operação e Configuração', M, 108);

  doc.font('Helvetica').fontSize(9.5).fillColor('#E2E8F0');
  doc.text('Sistema simples para gestão visual de LOTOTO da fábrica.', M, 134);

  doc.y = 220;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(C.TEXT_TITLE);
  doc.text('Apresentação do Sistema', M, doc.y);
  doc.y += 6;

  drawParagraph(
    'O EasyLOTOTO for Knauf é um sistema simples desenvolvido para a gestão visual de bloqueios e etiquetagens de energia perigosa (LOTOTO - Lockout, Tagout, Tryout) na fábrica. Este manual descreve o funcionamento de seus módulos, telas, ferramentas e procedimentos de uso.'
  );

  drawParagraph(
    'Projetado para operar em ambiente offline, o sistema roda localmente na infraestrutura da fábrica de forma autônoma. As plantas fabris, os registros de intervenção e os parâmetros de segurança são processados localmente com agilidade, sem necessidade de conexão externa com a internet.'
  );

  doc.y += 4;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.BLUE_PRIMARY);
  doc.text('FICHA TÉCNICA DO SISTEMA', M, doc.y);
  doc.y += 4;

  const techSpecs = [
    ['Nome do Sistema', 'EasyLOTOTO for Knauf (v2)'],
    ['Finalidade', 'Gestão Visual de Bloqueios e Etiquetagens (LOTOTO) da fábrica'],
    ['Modo de Operação', 'Ambiente offline (100% autônomo na rede local)'],
    ['Banco de Dados Local', 'SQLite WAL (server/data/factory.db)'],
    ['Acesso de Contingência', 'recovery (Acesso Seguro de Administrador)'],
    ['Sincronização Óptica', 'Código Visual Dinâmico / QR Streaming contínuo'],
    ['Padrão Normativo', 'NR-10, NR-12 e OSHA 29 CFR 1910.147 (LOTOTO)'],
    ['Data desta Versão', 'Novembro / 2026'],
  ];
  drawTable(['Especificação Técnica', 'Configuração do Sistema'], techSpecs, [160, CONTENT_W - 160]);

  // Rodapé da primeira página com os créditos solicitados
  const oldBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const credY = PAGE_H - 85;
  doc.moveTo(M, credY).lineTo(PAGE_W - M, credY).lineWidth(0.6).strokeColor(C.GRAY_LINE).stroke();

  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.BLUE_PRIMARY);
  doc.text('CRÉDITOS DO PROJETO', M, credY + 6);

  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.TEXT_TITLE).text('Idealizado por:', M, credY + 18, { lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(C.TEXT_BODY).text('Hadmilton de Melos Cordeiro', M + 65, credY + 18, { lineBreak: false });
  doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(C.TEXT_MUTED).text(' — Coordenador de Manutenção Elétrica / Supervisor de Estágio', M + 185, credY + 18);

  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.TEXT_TITLE).text('Desenvolvimento e implementação:', M, credY + 32, { lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(C.TEXT_BODY).text('Rodrigo Lopes Chaves de Aguiar', M + 155, credY + 32, { lineBreak: false });
  doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(C.TEXT_MUTED).text(' — Estagiário de Engenharia de Software', M + 285, credY + 32);
  doc.page.margins.bottom = oldBottom;
}

// =========================================================================
// 2. RESERVA DA PÁGINA 2 PARA O SUMÁRIO
// =========================================================================
function reserveTocPage() {
  doc.addPage();
}

// =========================================================================
// 3. CAPÍTULOS DE CONTEÚDO
// =========================================================================
function buildChapters() {
  // -----------------------------------------------------------------------
  // CAPÍTULO 1
  // -----------------------------------------------------------------------
  startChapter(
    '01',
    'Visão Geral e Arquitetura do EasyLOTOTO v2',
    'Mapeamento visual, operação offline e integridade de dados'
  );

  drawParagraph(
    'O EasyLOTOTO v2 foi desenvolvido para auxiliar o chão de fábrica a visualizar e controlar o bloqueio de energias perigosas. Ele posiciona os registros de isolamento diretamente sobre a representação gráfica das plantas industriais, facilitando a identificação imediata de equipamentos travados.'
  );

  drawSubSection('1.1. Arquitetura em Ambiente Offline');
  drawParagraph(
    'Projetado para operar em ambiente offline, o sistema não depende de conexão contínua com a internet. Toda a sua infraestrutura funciona de maneira autônoma na rede local da fábrica:'
  );

  drawBullet('Servidor Local', 'Executa em Node.js com Express no computador ou servidor local, atendendo requisições na porta 3001.');
  drawBullet('Banco de Dados SQLite em Modo WAL', 'Os dados (plantas, áreas, registros, usuários, KPIs e auditoria) são salvos no arquivo server/data/factory.db com alta confiabilidade.');
  drawBullet('Armazenamento Local de Imagens', 'As plantas enviadas são salvas na pasta server/data/uploads/, garantindo acesso imediato.');
  drawBullet('Interface React SPA', 'A aplicação gráfica roda no navegador do usuário, com renderização via Canvas para navegação suave em plantas industriais.');

  drawSubSection('1.2. Gestão Visual da Fábrica');
  drawParagraph(
    'A tela principal do EasyLOTOTO v2 exibe a planta da fábrica com as áreas demarcadas. A presença de cadeados e indicadores visuais permite que operadores e equipes de manutenção vejam rapidamente se uma máquina está bloqueada para intervenção.'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 2
  // -----------------------------------------------------------------------
  startChapter(
    '02',
    'Acesso, Segurança e Conta de Recuperação',
    'Perfis de acesso, proteção contra tentativas inválidas e conta recovery'
  );

  drawParagraph(
    'O sistema controla os acessos através de sessões seguras e perfis de permissão bem definidos.'
  );

  drawSubSection('2.1. Primeiro Acesso (/setup)');
  drawParagraph(
    'Quando o sistema inicia com um banco de dados novo, ele exibe a tela de Primeiro Acesso para criar o administrador inicial da fábrica, definindo login, nome e senha mestra (mínimo de 8 caracteres).'
  );

  drawSubSection('2.2. A Conta de Recuperação Segura (recovery / 1234Abcd)');
  drawParagraph(
    'Para evitar a perda de acesso caso a senha do administrador seja esquecida, o EasyLOTOTO v2 mantém uma conta de contingência padrão:'
  );

  drawBullet('Criação Automática', 'Ao criar o primeiro usuário no Primeiro Acesso, o sistema cria automaticamente a conta "recovery" com perfil de admin e senha "1234Abcd".');
  drawBullet('Invisível na Lista de Usuários', 'A conta "recovery" não aparece na lista de usuários (GET /api/users) para manter a tela limpa e segura.');
  drawBullet('Protegida contra Exclusão e Alteração', 'Não é possível excluir, alterar o perfil ou trocar a senha padrão da conta recovery via interface.');
  drawBullet('Garantia de Login', 'Se o usuário digitar "recovery" no login, o servidor valida e assegura a existência da conta com sua senha padrão.');

  drawCallout(
    'danger',
    'Guarda da Senha de Contingência',
    'A conta "recovery" com senha "1234Abcd" serve como chave mestra de segurança. Se as senhas dos administradores forem perdidas, faça login com ela para redefinir as senhas dos usuários normais.'
  );

  drawSubSection('2.3. Matriz de Perfis');
  const permHeaders = ['Módulo / Ação', 'Viewer (Visualizador)', 'Operator (Operador)', 'Admin (Administrador)'];
  const permRows = [
    ['Visualizar mapa e áreas da fábrica', 'Sim', 'Sim', 'Sim'],
    ['Ver detalhes dos bloqueios ativos', 'Sim', 'Sim', 'Sim'],
    ['Criar registros e dar baixa de desbloqueio', 'Não', 'Sim', 'Sim'],
    ['Importar planilhas de bloqueios (Excel/CSV)', 'Não', 'Sim', 'Sim'],
    ['Exportar registros em Excel e PDF', 'Sim', 'Sim', 'Sim'],
    ['Editar plantas e desenhar novas áreas', 'Não', 'Não', 'Sim'],
    ['Criar campos personalizados e fórmulas de KPIs', 'Não', 'Não', 'Sim'],
    ['Cadastrar e gerenciar usuários', 'Não', 'Não', 'Sim'],
    ['Gerenciar backups, sincronização e Área de Risco', 'Não', 'Não', 'Sim'],
  ];
  drawTable(permHeaders, permRows, [160, 110, 110, 135]);

  drawSubSection('2.4. Proteção contra Tentativas Inválidas de Login (CAPTCHA)');
  drawParagraph(
    'Após 3 erros consecutivos de senha, a tela de login passa a exigir a digitação obrigatória de um código de verificação (CAPTCHA). A partir de 5 erros, aplica-se tempo de espera progressivo para novas tentativas.'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 3
  // -----------------------------------------------------------------------
  startChapter(
    '03',
    'Interface Geral e Navegação Responsiva',
    'Navegação entre abas, adaptação para telas touch e modais do sistema'
  );

  drawParagraph(
    'A interface do EasyLOTOTO v2 foi pensada para ser prática tanto em computadores de escritório quanto em tablets e totens com telas sensíveis ao toque.'
  );

  drawSubSection('3.1. Barra de Navegação');
  drawParagraph(
    'A barra superior exibe o nome do sistema EasyLOTOTO v2, links para os módulos operacionais (Dashboard, Registros, Relatórios, Plantas e Áreas, Campos e KPIs, Configurações, Usuários, Backup), o nome do usuário logado e botão de saída.'
  );

  drawSubSection('3.2. Ajustes para Dispositivos Touchable (Telas Touch)');
  drawBullet('Sem Rolagem Horizontal', 'Ajustes no layout elástico impedem que telas com botões de ação fiquem com barra de rolagem horizontal em telas menores.');
  drawBullet('Manutenção do Scroll do Menu', 'Ao rolar o menu de configurações e clicar em um item, o menu não pula para o início, preservando a posição em que o usuário estava navegando.');
  drawBullet('Modais do Próprio Sistema', 'Todas as caixas de alerta, confirmação e formulários usam caixas de diálogo integradas, sem travamentos do navegador.');

  // -----------------------------------------------------------------------
  // CAPÍTULO 4
  // -----------------------------------------------------------------------
  startChapter(
    '04',
    'Módulo: Visualizador de Planta Interativo',
    'Controles de zoom, pan, sinalização de cadeados e detalhes'
  );

  drawParagraph(
    'O visualizador interativo mostra o mapa da fábrica com a localização de cada equipamento e os bloqueios em vigor.'
  );

  drawSubSection('4.1. Controles de Visualização');
  drawBullet('Pan (Arrastar)', 'Clique e arraste sobre o fundo da tela para mover o mapa.');
  drawBullet('Zoom', 'Gire a roda do mouse ou use os botões (+) e (-) para aproximar ou afastar.');
  drawBullet('Enquadramento', 'O botão de ajustar centraliza a planta inteira na tela.');
  drawBullet('Duplo-clique', 'Dois cliques sobre uma área aproximam o foco diretamente sobre ela.');

  drawSubSection('4.2. Cadeados LOTOTO e Idade do Bloqueio');
  drawParagraph(
    'Quando há um bloqueio ativo associado à área, aparece um ícone de cadeado. Se houver mais de um bloqueio no mesmo local, um número indica a quantidade total. A cor do cadeado indica o tempo de bloqueio:'
  );

  const stageHeaders = ['Faixa de Duração', 'Cor Indicativa', 'Situação'];
  const stageRows = [
    ['0 a 12 horas', 'Azul (#2563EB)', 'Bloqueio recente / Turno atual'],
    ['12 a 24 horas', 'Amarelo (#D97706)', 'Bloqueio estendido / Passagem de turno'],
    ['24 a 48 horas', 'Laranja (#EA580C)', 'Manutenção prolongada'],
    ['Acima de 48 horas', 'Vermelho (#DC2626)', 'Bloqueio antigo / Pendência crítica'],
  ];
  drawTable(stageHeaders, stageRows, [130, 140, 245]);

  drawSubSection('4.3. Detalhes ao Clicar');
  drawParagraph(
    'Ao clicar no cadeado ou na área, abre-se a gaveta lateral informando: equipamento, setor, responsável pelo bloqueio, data e hora de colocação, motivo e quantidade de cadeados instalados.'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 5
  // -----------------------------------------------------------------------
  startChapter(
    '05',
    'Módulo: Plantas e Áreas (Editor Vetorial)',
    'Desenho de áreas, alinhamento magnético, multi-seleção e histórico'
  );

  drawParagraph(
    'O editor permite importar imagens de plantas industriais e demarcar sobre elas as áreas e equipamentos da fábrica.'
  );

  drawSubSection('5.1. Ferramentas de Desenho');
  drawBullet('Criar Polígono', 'Clique para inserir pontos contornando o equipamento. Ao clicar no ponto inicial ou dar duplo-clique, o polígono é finalizado.');
  drawBullet('Criar Retângulo', 'Clique e arraste entre os cantos opostos para desenhar um retângulo.');
  drawBullet('Placeholder Alinhado', 'Durante o desenho, a forma de pré-visualização acompanha com precisão a posição do mouse.');

  drawSubSection('5.2. Alinhamento Magnético');
  drawParagraph(
    'Ao mover os pontos de uma área, o sistema atrai suavemente o vértice para alinhá-lo com linhas horizontais e verticais próximas, facilitando o ajuste. O botão "Magnético: Ativado / Desativado" permite desligar esse auxílio quando for necessário fazer ajustes livres.'
  );

  drawSubSection('5.3. Seleção Múltipla com Tecla [CTRL]');
  drawBullet('Como Usar', 'Segure a tecla [CTRL] e clique sobre várias áreas no mapa ou na lista.');
  drawBullet('Destaque Visual', 'As áreas selecionadas recebem contorno destacado para não confundir com os demais itens.');
  drawBullet('Edição em Lote', 'Ao selecionar múltiplos itens, a barra lateral oculta informações individuais e foca apenas nas configurações em comum ("Informações mostradas ao clicar no cadeado").');

  drawSubSection('5.4. Desfazer (Ctrl+Z) e Refazer (Ctrl+Y)');
  drawParagraph(
    'O editor guarda um histórico de pelo menos 10 passos. Use Ctrl + Z para desfazer uma alteração ou Ctrl + Y para avançar novamente, prevenindo perdas acidentais durante a edição.'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 6
  // -----------------------------------------------------------------------
  startChapter(
    '06',
    'Módulo: Registros de Bloqueio (LOTOTO)',
    'Controle de intervenções de campo, encerramentos e auditoria de registros'
  );

  drawParagraph(
    'A aba Registros reúne o histórico completo de bloqueios de energia da fábrica.'
  );

  drawSubSection('6.1. Cadastro e Baixa de Bloqueio');
  drawBullet('Novo Registro', 'Clique em "Novo registro" para informar o equipamento, setor, técnico que realizou o bloqueio, data/hora e o motivo da intervenção.');
  drawBullet('Baixa de Bloqueio', 'Ao finalizar a manutenção, edite o registro e preencha a "Data de desbloqueio". O cadeado da máquina sai da tela imediatamente e o registro passa a constar como concluído.');

  drawSubSection('6.2. Filtros e Operações em Massa');
  drawParagraph(
    'É possível buscar por texto, filtrar por setor, equipamento e status ("Todos os registros" ou "Somente ativos"). Administradores podem selecionar vários registros e excluí-los em massa com confirmação.'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 7
  // -----------------------------------------------------------------------
  startChapter(
    '07',
    'Módulo: Importações de Dados Externos',
    'Carga de bloqueios existentes provenientes de SAP, Excel ou Poka'
  );

  drawParagraph(
    'O objetivo do módulo de importação é permitir carregar dados externos de bloqueios existentes no sistema, como planilhas provenientes do SAP, Excel ou Poka, consolidando as intervenções em uma interface visual unificada.'
  );

  drawStepWorkflow([
    { title: 'Upload', desc: 'Envie o arquivo .xlsx ou .csv com os bloqueios.' },
    { title: 'Colunas', desc: 'Ligue as colunas externas aos campos do EasyLOTOTO.' },
    { title: 'Conferência', desc: 'Veja a pré-visualização das linhas na tela.' },
    { title: 'Gravação', desc: 'Grave os registros sem duplicações automáticas.' },
  ]);

  drawSubSection('7.1. Perfis de Importação Salvos');
  drawParagraph(
    'Se a sua fábrica exporta sempre o mesmo formato de relatório do SAP ou Poka, salve o mapeamento das colunas com um nome (ex: "Importação SAP Diária"). Na próxima vez, basta escolher esse perfil para carregar as colunas de imediato.'
  );

  drawSubSection('7.2. Detecção de Duplicidades e Reversão');
  drawParagraph(
    'O sistema analisa o conteúdo das linhas para não importar registros repetidos. Cada importação concluída fica salva no histórico e pode ser desfeita com o botão "Desfazer importação" caso o arquivo enviado contenha dados incorretos.'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 8
  // -----------------------------------------------------------------------
  startChapter(
    '08',
    'Campos, KPIs e Mini Manual de Expressões',
    'Sintaxe completa, catálogo de comandos, funções e exemplos práticos'
  );

  drawParagraph(
    'O EasyLOTOTO v2 possui um motor próprio de expressões para três finalidades principais: (1) definir filtros de cadeados nas áreas, (2) criar campos calculados automaticamente e (3) gerar cartões de KPIs no Dashboard.'
  );

  drawSubSection('8.1. Regras Gerais de Sintaxe');
  drawBullet('Campos', 'Nomes ou chaves de campos devem estar sempre entre colchetes, por exemplo: [Equipamento], [Setor], [data_bloqueio]. Não diferencia maiúsculas de minúsculas nem acentos.');
  drawBullet('Textos (Strings)', 'Devem estar entre aspas duplas: "Produção", "Prensa 01".');
  drawBullet('Números e Booleanos', 'Números são digitados diretamente (10, 24.5). Booleanos: true, false, verdadeiro, falso.');
  drawBullet('Valores Nulos', 'null ou nulo representam campos vazios ou ausentes.');
  drawBullet('Palavra Especial "ativo"', 'Retorna verdadeiro se o registro estiver atualmente ativo segundo a regra da fábrica.');

  drawSubSection('8.2. Operadores Suportados');
  const opHeaders = ['Operador', 'Alternativas', 'Significado / Uso'];
  const opRows = [
    ['==', '=', 'Igualdade (ex: [Setor] == "Laminação")'],
    ['!=', '<>', 'Diferente (ex: [Setor] != "Usinagem")'],
    ['<, <=, >, >=', '—', 'Comparações numéricas ou de datas'],
    ['&&', 'and, e', 'E lógico — ambas condições verdadeiras'],
    ['||', 'or, ou', 'OU lógico — pelo menos uma condição verdadeira'],
    ['!', 'not, nao', 'Negação lógica (ex: !isEmpty([data_desbloqueio]))'],
    ['+, -, *, /', '%', 'Operações matemáticas básicas (+ concatena textos)'],
  ];
  drawTable(opHeaders, opRows, [90, 110, 315]);

  drawSubSection('8.3. Catálogo de Funções Embutidas');

  const fnHeaders = ['Função', 'Exemplo de Uso', 'O que Faz / Retorno'];
  const fnRows = [
    ['isEmpty(x)', 'isEmpty([data_desbloqueio])', 'Retorna true se o campo for vazio ou nulo'],
    ['contains(a, b)', 'contains([Equipamento], "Torno")', 'Verifica se o texto a contém o trecho b'],
    ['startsWith(a, b)', 'startsWith([Setor], "Linha")', 'Verifica se o texto começa com o trecho'],
    ['endsWith(a, b)', 'endsWith([Equipamento], "01")', 'Verifica se o texto termina com o trecho'],
    ['lower(a), upper(a)', 'lower([Setor])', 'Converte texto para minúsculas ou maiúsculas'],
    ['trim(a)', 'trim([Equipamento])', 'Remove espaços extras das extremidades'],
    ['len(a)', 'len([Motivo]) > 10', 'Retorna o número de caracteres do texto'],
    ['split(str, delim)', 'split([Tags], ";")', 'Separa texto em partes pelo delimitador'],
    ['oneOf(x, a, b...)', 'oneOf([Setor], "Setor A", "Setor B")', 'True se x for igual a qualquer um dos itens'],
    ['between(x, a, b)', 'between([Qtd], 1, 5)', 'True se x estiver entre o valor a e b'],
    ['now(), today()', 'today()', 'Retorna data/hora atual ou início do dia atual'],
    ['daysSince(d)', 'daysSince([data_bloqueio]) > 3', 'Quantidade de dias decorridos da data até agora'],
    ['hoursSince(d)', 'hoursSince([data_bloqueio]) > 24', 'Quantidade de horas decorridas da data até agora'],
    ['diffDays(a, b)', 'diffDays([data_bloqueio], [data_desbloqueio])', 'Diferença em dias entre duas datas'],
    ['diffHours(a, b)', 'diffHours([data_bloqueio], [data_desbloqueio])', 'Diferença em horas entre duas datas'],
    ['year(d), month(d)', 'year([data_bloqueio]) == 2026', 'Extrai o ano, mês (1-12) ou dia de uma data'],
    ['if(cond, a, b)', 'if(ativo, "Em Aberto", "Encerrado")', 'Se a condição for verdadeira retorna a, senão b'],
    ['coalesce(a, b...)', 'coalesce([Motivo], "Não informado")', 'Retorna o primeiro valor preenchido da lista'],
    ['round(n, d)', 'round(daysSince([data_bloqueio]), 1)', 'Arredonda o número n para d casas decimais'],
    ['min(...), max(...)', 'max([Qtd1], [Qtd2])', 'Retorna o menor ou maior número entre os valores'],
  ];
  drawTable(fnHeaders, fnRows, [125, 175, 215]);

  drawSubSection('8.4. Exemplos Práticos');
  drawCodeSnippet(
    'Filtro de Área / Cadeado (Ativa cadeado para equipamento específico)',
    '[Equipamento] == "Prensa Hidráulica 01" && isEmpty([data_desbloqueio])'
  );
  drawCodeSnippet(
    'Campo Calculado: Dias Bloqueado',
    'if(isEmpty([data_desbloqueio]), round(daysSince([data_bloqueio]), 1), round(diffDays([data_bloqueio], [data_desbloqueio]), 1))'
  );
  drawCodeSnippet(
    'Expressão de KPI no Dashboard (Bloqueios ativos sem motivo preenchido)',
    'ativo && isEmpty([Motivo])'
  );
  drawCodeSnippet(
    'Expressão de KPI no Dashboard (Bloqueios ativos há mais de 24 horas)',
    'ativo && hoursSince([data_bloqueio]) > 24'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 9
  // -----------------------------------------------------------------------
  startChapter(
    '09',
    'Módulo: Relatórios e Exportação',
    'Gráficos de Gantt, relatórios impressos em PDF e planilhas Excel'
  );

  drawParagraph(
    'A aba Relatórios permite analisar o tempo de parada dos equipamentos e gerar documentos para conferência e auditoria.'
  );

  drawSubSection('9.1. Gráfico de Gantt');
  drawParagraph(
    'Mostra os bloqueios organizados em barras horizontais em uma linha do tempo. Isso permite ver quais máquinas estavam bloqueadas simultaneamente e quanto tempo cada intervenção durou.'
  );

  drawSubSection('9.2. Relatórios em PDF e Excel');
  drawBullet('Relatórios PDF', 'Exporta fichas de bloqueios ativos ou históricos por período em formato A4 paisagem, ideais para impressão e quadros de aviso da fábrica.');
  drawBullet('Exportação Excel', 'Gera planilha .xlsx formatada (registros-lototo-AAAAMMDD.xlsx) contendo todos os dados para análises adicionais.');

  // -----------------------------------------------------------------------
  // CAPÍTULO 10
  // -----------------------------------------------------------------------
  startChapter(
    '10',
    'Backups, Sincronização Dinâmica e Área de Risco',
    'Backups em arquivo, transmissão por QR Code e Área de Risco'
  );

  drawParagraph(
    'A aba Backup centraliza a proteção de dados do sistema, rotinas de sincronização e opções de limpeza de banco.'
  );

  drawSubSection('10.1. Backups Locais (.zip)');
  drawBullet('Somente Dados', 'Copia apenas os registros de bloqueio e histórico de importações.');
  drawBullet('Dados + Configurações (Completo)', 'Inclui tudo: plantas, imagens, áreas desenhadas, campos, KPIs e ajustes. Possui opção de incluir usuários para clonar estações.');
  drawBullet('Backup Automático Diário', 'O servidor cria um backup automático todo dia e guarda os últimos 14 arquivos no disco local.');

  drawSubSection('10.2. Sincronização Dinâmica por Código Visual (QR Code)');
  drawParagraph(
    'Para computadores de fábrica que não conversam em rede com outros setores, o sistema permite transferir dados via Código Visual Dinâmico:'
  );
  drawBullet('Gerar Sincronização', 'Clique em "Iniciar Processo de Sincronização" para abrir o modal que exibe o fluxo rápido de QR Codes com os dados.');
  drawBullet('Receber Sincronização', 'Na outra máquina, vá em "Receber sincronização" -> "Abrir leitor da câmera" e aponte para a tela.');
  drawBullet('Transferência Manual por Texto', 'Se não houver câmera, copie o código em texto gerado e cole na máquina de destino.');

  drawSubSection('10.3. A Guia "Conta" e a Área de Risco');
  drawParagraph(
    'A guia "Conta" dispõe de funções para limpar o banco de dados quando necessário, apresentadas em layout com borda de aviso:'
  );
  drawBullet('Excluir Dados', 'Apaga todos os registros de bloqueio, mantendo plantas, áreas e campos.');
  drawBullet('Excluir Dados + Configurações', 'Limpa registros, plantas e campos, mas preserva as contas de usuários e senhas para que o acesso não seja perdido.');
  drawBullet('Excluir Backups', 'Apaga os arquivos .zip de backups antigos salvos no servidor para liberar espaço.');
  drawBullet('Palavra-Chave de Confirmação', 'Exige digitar a frase de confirmação correspondente (ex: "EXCLUIR DADOS") para evitar qualquer exclusão involuntária.');

  // -----------------------------------------------------------------------
  // CAPÍTULO 11
  // -----------------------------------------------------------------------
  startChapter(
    '11',
    'Configurações Gerais e Auditoria do Sistema',
    'Regra de bloqueio ativo, pasta de redundância externa e log de auditoria'
  );

  drawParagraph(
    'A aba Configurações ajusta parâmetros globais do sistema e permite auditar as ações realizadas.'
  );

  drawSubSection('11.1. Regra de Bloqueio Ativo');
  drawParagraph(
    'Define a fórmula que determina se um registro está ativo ou encerrado. O padrão de fábrica é isEmpty([data_desbloqueio]), indicando que a máquina está bloqueada enquanto não for registrada a data de desbloqueio.'
  );

  drawSubSection('11.2. Pasta Externa para Cópia de Backups');
  drawParagraph(
    'Permite indicar um caminho em outro disco rígido ou em uma pasta compartilhada na rede (ex: D:\\Backups\\LOTOTO ou \\\\servidor\\pasta). O botão "Testar pasta" valida o acesso de escrita.'
  );

  drawSubSection('11.3. Trilha de Auditoria');
  drawParagraph(
    'Registra eventos importantes (criação e exclusão de bloqueios, alterações de layout, importações e ações de risco) com data, hora e nome do usuário.'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 12
  // -----------------------------------------------------------------------
  startChapter(
    '12',
    'Guia Rápido, Teclas de Atalho e FAQ',
    'Resumo de comandos, atalhos de mouse/teclado e perguntas frequentes'
  );

  drawParagraph(
    'Consolidado de atalhos e comandos para agilizar a operação do sistema:'
  );

  const shortcutHeaders = ['Comando / Tecla', 'Módulo', 'Ação / Efeito'];
  const shortcutRows = [
    ['Ctrl + Z', 'Editor de Plantas e Áreas', 'Desfaz a última alteração (histórico de até 10 passos).'],
    ['Ctrl + Y', 'Editor de Plantas e Áreas', 'Refaz a alteração desfeita.'],
    ['Tecla [CTRL] + Clique', 'Editor de Plantas e Áreas', 'Seleciona múltiplas áreas para edição em lote.'],
    ['Roda do Mouse (Scroll)', 'Visualizador / Editor', 'Aplica zoom in / out suave na posição do cursor.'],
    ['Arrastar (Botão Esquerdo)', 'Visualizador', 'Move o mapa pela tela.'],
    ['Duplo-clique na Área', 'Visualizador', 'Aproxima a visualização na área clicada.'],
    ['Clique no Fundo da Planta', 'Editor de Plantas e Áreas', 'Desmarca seleção e mostra dados da planta.'],
    ['Botão Magnético', 'Barra do Editor', 'Liga ou desliga o alinhamento magnético dos pontos.'],
    ['Login "recovery"', 'Tela de Login', 'Acesso de contingência com perfil de administrador.'],
  ];
  drawTable(shortcutHeaders, shortcutRows, [130, 150, 235]);

  drawSubSection('12.1. Perguntas Frequentes (FAQ)');
  drawBullet(
    'Esqueci a senha do administrador. O que fazer?',
    'Acesse a tela de login e entre com o usuário "recovery" e senha "1234Abcd". O sistema abrirá com perfil de administrador, permitindo redefinir as senhas dos demais usuários na aba Usuários.'
  );

  drawBullet(
    'Por que a conta "recovery" não aparece na lista de usuários?',
    'A conta foi programada para ser oculta na interface gráfica para segurança, prevenindo alterações acidentais.'
  );

  drawBullet(
    'Como deixar a visualização do mapa liberada para totens sem pedir login?',
    'Na aba Usuários (ou Configurações), ative a opção "Visualização pública". Assim, totens e telas de fábrica exibem o mapa com os cadeados sem exigir senha.'
  );

  checkSpace(55);
  doc.y += 12;
  doc.moveTo(M, doc.y).lineTo(PAGE_W - M, doc.y).lineWidth(0.8).strokeColor(C.GRAY_LINE).stroke();
  doc.y += 10;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.NAVY);
  doc.text('EasyLOTOTO for Knauf — Sistema simples para gestão visual de LOTOTO da fábrica.', M, doc.y, { align: 'center', width: CONTENT_W });
}

// =========================================================================
// 4. PREENCHIMENTO DO SUMÁRIO (PÁGINA 2) COM OS NÚMEROS REAIS
// =========================================================================
function fillTableOfContents() {
  doc.switchToPage(1); // Página 2 (índice 1)
  doc.y = TOP_MARGIN;

  doc.font('Helvetica-Bold').fontSize(16).fillColor(C.NAVY);
  doc.text('Sumário do Manual de Uso', M, doc.y);
  doc.y += 4;
  doc.moveTo(M, doc.y).lineTo(PAGE_W - M, doc.y).lineWidth(1).strokeColor(C.BLUE_PRIMARY).stroke();
  doc.y += 14;

  chapterRegistry.forEach((ch) => {
    const y = doc.y;

    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ORANGE_SIGNAL);
    doc.text(ch.number, M, y, { width: 22 });

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.TEXT_TITLE);
    doc.text(ch.title, M + 26, y, { width: CONTENT_W - 75 });

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.BLUE_PRIMARY);
    doc.text(`Pág. ${ch.pageNum}`, M + CONTENT_W - 45, y, { width: 45, align: 'right' });

    if (ch.subtitle) {
      doc.font('Helvetica').fontSize(7.5).fillColor(C.TEXT_MUTED);
      doc.text(ch.subtitle, M + 26, doc.y + 1, { width: CONTENT_W - 75 });
    }

    doc.moveTo(M + 26, doc.y + 4).lineTo(M + CONTENT_W, doc.y + 4).lineWidth(0.3).strokeColor(C.GRAY_LINE).stroke();
    doc.y += 7;
  });

  doc.y += 8;
  drawCallout(
    'tip',
    'Padronização da Nomenclatura LOTOTO',
    'O EasyLOTOTO for Knauf adota a sigla LOTOTO (Lockout, Tagout, Tryout), reforçando o ciclo de travamento mecânico/elétrico, etiquetagem e teste de energia zero antes de qualquer atividade de manutenção.'
  );
}

// =========================================================================
// 5. RODAPÉS E CABEÇALHOS NUMERADOS (TWO-PASS)
// =========================================================================
function applyHeaderAndFooter() {
  const range = doc.bufferedPageRange();
  const totalPages = range.count;

  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);

    // Página 1 (Capa): sem cabeçalho e sem rodapé padrão (já possui rodapé próprio de créditos)
    if (i === 0) continue;

    const oldTop = doc.page.margins.top;
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.top = 0;
    doc.page.margins.bottom = 0;

    // Cabeçalho Superior
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.BLUE_PRIMARY);
    doc.text('EasyLOTOTO for Knauf', M, 24, { lineBreak: false });

    doc.font('Helvetica').fontSize(7.5).fillColor(C.TEXT_MUTED);
    doc.text('•  Manual de Uso', M + 95, 24, { lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.NAVY);
    doc.text('EasyLOTOTO for Knauf', PAGE_W - M - 120, 24, { width: 120, align: 'right', lineBreak: false });

    doc.moveTo(M, 36).lineTo(PAGE_W - M, 36).lineWidth(0.5).strokeColor(C.GRAY_LINE).stroke();

    // Rodapé Inferior
    doc.moveTo(M, PAGE_H - 34).lineTo(PAGE_W - M, PAGE_H - 34).lineWidth(0.5).strokeColor(C.GRAY_LINE).stroke();

    doc.font('Helvetica').fontSize(7.5).fillColor(C.TEXT_MUTED);
    doc.text('EasyLOTOTO for Knauf • Gestão Visual de Bloqueios e Etiquetagens LOTOTO', M, PAGE_H - 26, { lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.NAVY);
    doc.text(`Página ${i + 1} de ${totalPages}`, PAGE_W - M - 90, PAGE_H - 26, { width: 90, align: 'right', lineBreak: false });

    doc.page.margins.top = oldTop;
    doc.page.margins.bottom = oldBottom;
  }
}

// =========================================================================
// EXECUÇÃO DO FLUXO COMPLETO
// =========================================================================
console.log('Iniciando compilação do Manual de Uso do EasyLOTOTO for Knauf em PDF...');
buildCoverPage();
reserveTocPage();
buildChapters();
console.log('Capítulos mapeados no sumário:', chapterRegistry.map(c => `Cap ${c.number}: pág ${c.pageNum}`));
fillTableOfContents();
applyHeaderAndFooter();

doc.end();

writeStream.on('finish', () => {
  const stats = fs.statSync(outputPath);
  console.log('Manual compilado com sucesso!');
  console.log(`Arquivo: ${outputPath}`);
  console.log(`Tamanho: ${(stats.size / 1024).toFixed(1)} KB`);

  // Cópias automáticas para as pastas públicas e deploy
  const targets = [
    path.resolve(here, '../../client/public/Manual_de_Uso_EasyLOTOTO_for_Knauf.pdf'),
    path.resolve(here, '../../factory-map-deploy/Manual_de_Uso_EasyLOTOTO_for_Knauf.pdf'),
    path.resolve(here, '../../factory-map-deploy/client/public/Manual_de_Uso_EasyLOTOTO_for_Knauf.pdf'),
  ];
  targets.forEach((tgt) => {
    try {
      fs.copyFileSync(outputPath, tgt);
      console.log(`Cópia sincronizada para: ${tgt}`);
    } catch (e) {
      console.error(`Erro ao copiar para ${tgt}:`, e.message);
    }
  });
});
