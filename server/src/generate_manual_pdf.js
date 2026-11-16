// Script oficial de compilação do Manual de Uso do EasyLOTOTO v2 em PDF.
// Executado com: node server/src/generate_manual_pdf.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(here, '../../Manual_de_Uso_EasyLOTOTO_v2.pdf');

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
    Title: 'Manual de Uso do EasyLOTOTO v2',
    Author: 'EasyLOTOTO v2',
    Subject: 'Manual Técnico de Operação e Uso do Sistema',
    Keywords: 'EasyLOTOTO, LOTOTO, Manual, Bloqueio, Etiquetagem, Mapa da fábrica',
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
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.BLUE_DARK);
  doc.text(title, M, doc.y + 4, { width: CONTENT_W });
  doc.y += 4;
}

function drawParagraph(text, options = {}) {
  const h = doc.heightOfString(text, { width: CONTENT_W, lineGap: 3 });
  checkSpace(h + 8);
  doc.font('Helvetica').fontSize(9.5).fillColor(C.TEXT_BODY);
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
    info: { border: C.BLUE_PRIMARY, bg: C.BLUE_LIGHT, text: C.BLUE_DARK, badge: 'INFORMAÇÃO TÉCNICA' },
    tip: { border: C.GREEN_SUCCESS, bg: C.GREEN_LIGHT, text: C.TEXT_BODY, badge: 'RECOMENDAÇÃO OPERACIONAL' },
    warning: { border: C.ORANGE_SIGNAL, bg: C.ORANGE_LIGHT, text: C.TEXT_BODY, badge: 'ATENÇÃO OPERACIONAL' },
    danger: { border: C.RED_DANGER, bg: C.RED_LIGHT, text: C.TEXT_BODY, badge: 'SEGURANÇA / CONTINGÊNCIA' },
  };
  const s = styles[type] || styles.info;
  const boxW = CONTENT_W;
  const textH = doc.heightOfString(text, { width: boxW - 24, lineGap: 2 });
  const totalH = textH + 28;

  checkSpace(totalH + 10);
  const y = doc.y;

  doc.roundedRect(M, y, boxW, totalH, 4).fill(s.bg);
  doc.roundedRect(M, y, 4, totalH, 2).fill(s.border);
  doc.roundedRect(M, y, boxW, totalH, 4).lineWidth(0.5).strokeColor(C.GRAY_BORDER).stroke();

  doc.font('Helvetica-Bold').fontSize(8).fillColor(s.border);
  doc.text(`${s.badge}: ${title.toUpperCase()}`, M + 14, y + 8, { width: boxW - 28 });

  doc.font('Helvetica').fontSize(8.5).fillColor(s.text);
  doc.text(text, M + 14, y + 20, { width: boxW - 28, lineGap: 2 });

  doc.y = y + totalH + 8;
}

function drawTable(headers, rows, colWidths) {
  const totalW = CONTENT_W;
  const rowPad = 5;
  const headerH = 20;

  checkSpace(headerH + 24);

  let curY = doc.y;
  doc.rect(M, curY, totalW, headerH).fill(C.NAVY);

  let curX = M;
  headers.forEach((h, i) => {
    const w = colWidths[i];
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.WHITE);
    doc.text(h, curX + rowPad, curY + 6, { width: w - rowPad * 2, ellipsis: true });
    curX += w;
  });

  curY += headerH;

  rows.forEach((r, ri) => {
    let maxCellH = 14;
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
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.WHITE);
        doc.text(h, hX + rowPad, curY + 6, { width: w - rowPad * 2, ellipsis: true });
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
  doc.y = curY + 10;
}

function drawCodeSnippet(title, code) {
  const h = doc.heightOfString(code, { width: CONTENT_W - 24, lineGap: 2 });
  checkSpace(h + 30);
  const y = doc.y;

  doc.roundedRect(M, y, CONTENT_W, h + 24, 4).fill(C.CODE_BG);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.TEXT_MUTED);
  doc.text(title.toUpperCase(), M + 12, y + 6);

  doc.font('Courier').fontSize(8.5).fillColor(C.CODE_TEXT);
  doc.text(code, M + 12, y + 18, { width: CONTENT_W - 24, lineGap: 2 });

  doc.y = y + h + 30;
}

function drawStepWorkflow(steps) {
  checkSpace(65);
  const gap = 8;
  const count = steps.length;
  const boxW = (CONTENT_W - gap * (count - 1)) / count;
  const boxH = 50;
  const y = doc.y;

  steps.forEach((step, idx) => {
    const x = M + idx * (boxW + gap);
    doc.roundedRect(x, y, boxW, boxH, 4).fill(C.GRAY_BOX).strokeColor(C.GRAY_BORDER).lineWidth(0.6).stroke();

    // Badge numérico
    doc.roundedRect(x + 6, y + 6, 16, 14, 2).fill(C.BLUE_PRIMARY);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.WHITE).text(String(idx + 1), x + 6, y + 9, { width: 16, align: 'center' });

    // Título do passo
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.TEXT_TITLE).text(step.title, x + 26, y + 8, { width: boxW - 30, lineBreak: false, ellipsis: true });

    // Descrição
    doc.font('Helvetica').fontSize(7.5).fillColor(C.TEXT_BODY).text(step.desc, x + 6, y + 24, { width: boxW - 12, lineGap: 1 });
  });

  doc.y = y + boxH + 10;
}

// =========================================================================
// 1. CAPA
// =========================================================================
function buildCoverPage() {
  doc.rect(0, 0, PAGE_W, 260).fill(C.NAVY);
  doc.rect(0, 255, PAGE_W, 5).fill(C.ORANGE_SIGNAL);

  doc.roundedRect(M, 42, 140, 22, 11).fill(C.BLUE_PRIMARY);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.WHITE);
  doc.text('MANUAL TÉCNICO OFICIAL', M + 10, 48, { lineBreak: false });

  doc.font('Helvetica-Bold').fontSize(32).fillColor(C.WHITE);
  doc.text('EasyLOTOTO v2', M, 80);

  doc.font('Helvetica').fontSize(14).fillColor('#94A3B8');
  doc.text('Manual de Uso do EasyLOTOTO v2 — Operação e Configuração', M, 122);

  doc.roundedRect(M, 156, CONTENT_W, 56, 6).fill(C.BLUE_DARK);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ORANGE_SIGNAL);
  doc.text('IDENTIFICAÇÃO DE ABERTURA: "MAPA DA FÁBRICA"', M + 14, 166);
  doc.font('Helvetica').fontSize(8.5).fillColor('#E2E8F0');
  doc.text(
    'Ao abrir o sistema, a interface inicial exibe o título "Mapa da fábrica" (acompanhado da legenda "Mapa de bloqueios LOTOTO"), fornecendo visão espacial imediata dos pontos de bloqueio e desenergização ativos na planta.',
    M + 14,
    180,
    { width: CONTENT_W - 28, lineGap: 2 }
  );

  doc.y = 285;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(C.TEXT_TITLE);
  doc.text('Visão Geral e Propósito Deste Manual', M, doc.y);
  doc.y += 6;

  drawParagraph(
    'O EasyLOTOTO v2 é a solução técnica de ponta desenvolvida para garantir rigor, agilidade e confiabilidade na gestão visual de Bloqueio, Etiquetagem e Teste de Energia Perigosa (LOTOTO - Lockout, Tagout, Tryout). Este manual descreve minuciosamente todos os módulos, comandos de tela, regras de negócio e procedimentos de segurança da plataforma.'
  );

  drawParagraph(
    'Concebido para operar em ambiente industrial com máxima autonomia, o sistema roda de maneira independente na rede local da fábrica, eliminando riscos decorrentes de oscilações ou quedas de internet externa. As coordenadas espaciais das plantas fabris, os registros de intervenção e os parâmetros de segurança são processados localmente com altíssima velocidade.'
  );

  checkSpace(145);
  const metaY = doc.y + 10;
  doc.roundedRect(M, metaY, CONTENT_W, 110, 6).fill(C.GRAY_BG).strokeColor(C.GRAY_BORDER).lineWidth(0.8).stroke();

  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.BLUE_PRIMARY);
  doc.text('FICHA TÉCNICA DO SISTEMA', M + 14, metaY + 12);

  const colW = (CONTENT_W - 28) / 2;
  const l1Y = metaY + 30;

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.TEXT_TITLE).text('Nome do Sistema:', M + 14, l1Y);
  doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT_BODY).text('EasyLOTOTO v2', M + 130, l1Y);

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.TEXT_TITLE).text('Título de Abertura / Janela:', M + 14, l1Y + 16);
  doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT_BODY).text('Mapa da fábrica (Mapa de bloqueios LOTOTO)', M + 130, l1Y + 16);

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.TEXT_TITLE).text('Motor de Dados Local:', M + 14, l1Y + 32);
  doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT_BODY).text('SQLite WAL Engine (server/data/factory.db)', M + 130, l1Y + 32);

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.TEXT_TITLE).text('Conta de Acesso Seguro:', M + 14, l1Y + 48);
  doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT_BODY).text('recovery (Acesso Seguro de Contingência)', M + 130, l1Y + 48);

  const rX = M + colW + 14;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.TEXT_TITLE).text('Arquitetura do Cliente:', rX, l1Y);
  doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT_BODY).text('React SPA + Vite + Canvas Interativo', rX + 115, l1Y);

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.TEXT_TITLE).text('Protocolo de Sincronismo:', rX, l1Y + 16);
  doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT_BODY).text('Código Visual Dinâmico / QR Streaming', rX + 115, l1Y + 16);

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.TEXT_TITLE).text('Conformidade Normativa:', rX, l1Y + 32);
  doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT_BODY).text('NR-10, NR-12, OSHA 1910.147 (LOTOTO)', rX + 115, l1Y + 32);

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.TEXT_TITLE).text('Data desta Versão:', rX, l1Y + 48);
  doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT_BODY).text('Novembro / 2026', rX + 115, l1Y + 48);

  doc.y = metaY + 124;

  drawCallout(
    'info',
    'Público-Alvo e Abrangência',
    'Este documento atende a Operadores de Campo, Eletricistas, Mecânicos Industriais, Supervisores de Manutenção, Engenheiros de Segurança do Trabalho (SESMT) e Administradores de Infraestrutura responsáveis pela integridade do EasyLOTOTO v2.'
  );
}

// =========================================================================
// 2. RESERVA DA PÁGINA 2 PARA O SUMÁRIO
// =========================================================================
function reserveTocPage() {
  doc.addPage();
  // Ficará em branco durante o primeiro passo e será preenchida ao final
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
    'Conceito de mapa visual, autonomia local e integridade de dados'
  );

  drawParagraph(
    'O EasyLOTOTO v2 foi concebido para revolucionar a forma como o chão de fábrica visualiza e controla o isolamento de energias perigosas. Em fábricas modernas com centenas de válvulas, disjuntores, prensas e motores elétricos, o gerenciamento de bloqueios apenas por livros físicos ou planilhas estáticas gera lentidão e risco de erro humano. O EasyLOTOTO v2 resolve esse desafio projetando o estado real de cada cadeado diretamente sobre a planta arquitetônica da fábrica.'
  );

  drawSubSection('1.1. Arquitetura 100% Autônoma e Resiliente');
  drawParagraph(
    'Projetado para operar em ambientes industriais com restrições severas de rede ou sem acesso à nuvem, o EasyLOTOTO v2 não possui dependência de serviços remotos para sua operação diária. Todo o ecossistema é mantido localmente:'
  );

  drawBullet('Servidor Node.js Embutido', 'O backend roda como serviço leve de alta disponibilidade em Express, gerenciando rotas REST, uploads e transações.');
  drawBullet('Banco de Dados SQLite em Modo WAL', 'A persistência dos dados (plantas, áreas, registros, usuários, KPIs e auditoria) reside no arquivo server/data/factory.db. O modo Write-Ahead Logging (WAL) assegura leituras simultâneas sem concorrência de bloqueio de escrita.');
  drawBullet('Armazenamento Local de Plantas', 'Os desenhos e imagens de layout fabril residem na pasta server/data/uploads/, garantindo que as plantas estejam sempre acessíveis mesmo que a rede corporativa caia.');
  drawBullet('Cliente Web React SPA', 'A aplicação gráfica é executada no navegador do cliente, aproveitando aceleração de hardware para zoom e navegação espacial sem sobrecarregar o servidor.');

  drawSubSection('1.2. O Conceito "Mapa da Fábrica"');
  drawParagraph(
    'Ao abrir a aplicação, a primeira tela visível traz o título destacado "Mapa da fábrica" e o subtítulo "Mapa de bloqueios LOTOTO". Este módulo é a central de comando da fábrica, onde operadores e supervisores podem inspecionar num relance visual se uma linha ou máquina está segura para intervenção.'
  );

  drawCallout(
    'info',
    'Aderência Normativa LOTOTO',
    'O sistema implementa o ciclo completo Lockout (Travamento físico), Tagout (Etiquetagem informativa com identificação do responsável) e Tryout (Verificação de energia zero), atendendo às exigências da NR-10, NR-12 e OSHA 1910.147.'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 2
  // -----------------------------------------------------------------------
  startChapter(
    '02',
    'Acesso, Segurança e Conta de Recuperação',
    'Controle de privilégios, contingência administrativa e proteção contra intrusão'
  );

  drawParagraph(
    'O EasyLOTOTO v2 implementa autenticação baseada em sessões seguras e perfis de permissão calibrados para cada função na fábrica, prevenindo acessos indevidos e garantindo rastreabilidade absoluta.'
  );

  drawSubSection('2.1. Primeiro Acesso (/setup)');
  drawParagraph(
    'Ao iniciar um banco de dados recém-instalado, o sistema reconhece a ausência de usuários e redireciona para a tela de Primeiro Acesso. Nesse formulário, o usuário cadastra o administrador principal do sistema informando login, nome e senha mestra (com requisito de complexidade mínima de 8 caracteres).'
  );

  drawSubSection('2.2. A Conta de Recuperação Segura (recovery / 1234Abcd)');
  drawParagraph(
    'Para salvaguardar a continuidade operacional da fábrica caso as credenciais do administrador principal sejam esquecidas ou perdidas, o EasyLOTOTO v2 implementa uma conta administradora de contingência automática:'
  );

  drawBullet('Criação Automatizada', 'No instante em que o administrador cria sua conta no Primeiro Acesso, o sistema cria simultaneamente o usuário "recovery" com a senha inicial "1234Abcd" e perfil pleno de admin.');
  drawBullet('Invisibilidade na Listagem de Usuários', 'A conta "recovery" é expressamente omitida da rota GET /api/users e da tela de gestão de usuários. Usuários comuns e operadores não visualizam essa conta na interface.');
  drawBullet('Blindagem contra Alteração e Exclusão', 'A conta "recovery" não pode ser modificada por outros usuários, não pode ser deletada via sistema e sua senha fixa ("1234Abcd") não pode ser alterada pela tela de troca de senha.');
  drawBullet('Auto-regeneração no Login', 'Ao submeter o login "recovery", o servidor valida e assegura que a conta exista no banco com status ativo e papel de administrador.');

  drawCallout(
    'danger',
    'Instruções de Guarda da Senha de Recuperação',
    'O acesso via usuário "recovery" (senha "1234Abcd") deve ser tratado como procedimento de contingência industrial. Em caso de bloqueio das contas corporativas, acione a conta recovery para acessar a aba "Usuários" e restabelecer o acesso das contas dos operadores.'
  );

  drawSubSection('2.3. Matriz de Perfis e Permissões');
  const permHeaders = ['Recurso / Módulo', 'Viewer (Visualizador)', 'Operator (Operador)', 'Admin (Administrador)'];
  const permRows = [
    ['Visualizar Mapa da fábrica e áreas', 'Sim', 'Sim', 'Sim'],
    ['Inspecionar detalhes dos bloqueios ativos', 'Sim', 'Sim', 'Sim'],
    ['Cadastrar novos bloqueios e dar baixa', 'Não', 'Sim', 'Sim'],
    ['Importar planilhas Excel (.xlsx / .csv)', 'Não', 'Sim', 'Sim'],
    ['Exportar dados para Excel e relatórios', 'Sim', 'Sim', 'Sim'],
    ['Editar plantas e demarcar áreas vetoriais', 'Não', 'Não', 'Sim'],
    ['Gerenciar campos customizados e KPIs', 'Não', 'Não', 'Sim'],
    ['Gerenciar usuários, senhas e permissões', 'Não', 'Não', 'Sim'],
    ['Backups, Sincronização e Área de Risco', 'Não', 'Não', 'Sim'],
  ];
  drawTable(permHeaders, permRows, [160, 110, 110, 135]);

  drawSubSection('2.4. Proteção contra Ataques de Força Bruta e Desafio CAPTCHA');
  drawParagraph(
    'Para neutralizar tentativas de adivinhação de senhas, o sistema conta com rate-limiting exponencial: a partir de 3 tentativas consecutivas com senha inválida, a interface ativa um desafio visual CAPTCHA alfanumérico obrigatório gerado no servidor. A partir de 5 erros, a conta sofre bloqueio temporal progressivo.'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 3
  // -----------------------------------------------------------------------
  startChapter(
    '03',
    'Interface Geral e Navegação Responsiva',
    'Ergonomia visual, operação touchable e componentes integrados'
  );

  drawParagraph(
    'O EasyLOTOTO v2 foi desenhado para ser operado tanto em computadores de mesa quanto em tablets industriais e totens de autoatendimento instalados no piso de fábrica.'
  );

  drawSubSection('3.1. Barra Superior e Identidade Institucional');
  drawParagraph(
    'No topo da tela, a barra superior apresenta o selo oficial "Mapa da fábrica", atalhos para os módulos operacionais (Dashboard, Registros, Relatórios, Plantas e Áreas, Campos e KPIs, Configurações, Usuários, Backup), o nome do usuário ativo e o botão de encerramento seguro de sessão (Logout).'
  );

  drawSubSection('3.2. Adaptação para Telas Sensíveis ao Toque (Touchable)');
  drawParagraph(
    'Em ambientes fabris, o uso de luvas ou telas táteis com resoluções atípicas impõe desafios ergonômicos específicos. A versão v2 recebeu aprimoramentos cruciais:'
  );
  drawBullet('Eliminação de Rolagem Horizontal', 'As barras de ação de telas densas (como a aba de Registros) foram reorganizadas com empacotamento elástico (flex-wrap), garantindo que os botões "Novo registro" e "Alterações recentes" nunca causem scroll horizontal na janela.');
  drawBullet('Retenção de Posição de Rolagem (Scroll Persistence)', 'Nos menus de navegação de configurações, ao rolar a lista de abas e selecionar um item, a interface mantém a posição exata da rolagem, impedindo o salto indesejado para o topo.');
  drawBullet('Modais Nativos do Sistema', 'A aplicação não utiliza diálogos nativos do navegador (confirm e alert), os quais são de difícil manuseio em telas touch. Todas as mensagens, formulários de criação e confirmações de exclusão abrem modais estilizados com botões amplos e legíveis.');

  // -----------------------------------------------------------------------
  // CAPÍTULO 4
  // -----------------------------------------------------------------------
  startChapter(
    '04',
    'Módulo: Mapa da Fábrica (Visualizador Interativo)',
    'Navegação espacial, sinalização de cadeados e faixas etárias de bloqueio'
  );

  drawParagraph(
    'O módulo "Mapa da fábrica" é a espinha dorsal operacional do EasyLOTOTO v2. Ele transforma desenhos industriais bidimensionais em uma maquete digital viva do estado de segurança da planta.'
  );

  drawSubSection('4.1. Controles de Visualização Espacial');
  drawBullet('Arrastar / Pan', 'Pressione e segure o botão esquerdo do mouse (ou arraste com o dedo na tela touch) sobre qualquer área livre da planta para movimentar o mapa.');
  drawBullet('Zoom Suave Contínuo', 'Gire a roda do mouse (scroll wheel) ou faça o gesto de pinça no touch para ampliar ou reduzir o zoom, com foco ancorado na posição do cursor.');
  drawBullet('Botoeira de Zoom', 'Botões dedicados no canto inferior da tela permitem aplicar zoom in (+), zoom out (-) e restaurar o enquadramento completo da planta com um toque.');
  drawBullet('Foco Rápido por Duplo-clique', 'Dê um duplo-clique sobre qualquer equipamento demarcado para aproximar e centralizar a câmera imediatamente sobre ele.');

  drawSubSection('4.2. Cadeados LOTOTO Visuais e Faixas de Idade');
  drawParagraph(
    'Quando há um bloqueio ativo associado a uma área, um símbolo de Cadeado LOTOTO é desenhado no centro da área. O cadeado traz um contador numérico quando múltiplos bloqueios coexistem no mesmo equipamento, e sua tonalidade reflete a idade da intervenção:'
  );

  const stageHeaders = ['Faixa de Duração', 'Cor Indicativa', 'Classificação Operacional'];
  const stageRows = [
    ['0 a 12 horas', 'Azul Primário (#2563EB)', 'Bloqueio de turno normal em andamento'],
    ['12 a 24 horas', 'Amarelo Alerta (#D97706)', 'Bloqueio estendido / Transparência de turno'],
    ['24 a 48 horas', 'Laranja Atenção (#EA580C)', 'Manutenção de médio prazo / Parada programada'],
    ['Acima de 48 horas', 'Vermelho Crítico (#DC2626)', 'Bloqueio prolongado / Necessidade de auditoria'],
  ];
  drawTable(stageHeaders, stageRows, [130, 140, 245]);

  drawSubSection('4.3. Gaveta Lateral de Detalhes do Bloqueio');
  drawParagraph(
    'Ao clicar sobre um cadeado ou sobre a área de uma máquina, uma gaveta lateral desliza suavemente na tela exibindo o resumo detalhado: código da máquina, setor, crachá/nome de quem efetuou o bloqueio, data e hora de início, motivo e quantidade física de cadeados instalados.'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 5
  // -----------------------------------------------------------------------
  startChapter(
    '05',
    'Módulo: Plantas e Áreas (Editor Vetorial)',
    'Desenho de áreas, alinhamento magnético, multi-seleção e histórico Ctrl+Z'
  );

  drawParagraph(
    'O editor vetorial do EasyLOTOTO v2 disponibiliza ferramentas de precisão para demarcação de máquinas e setores sobre imagens de plantas industriais (PNG, JPG, SVG).'
  );

  drawSubSection('5.1. Ferramentas de Criação de Áreas');
  drawBullet('Criar Polígono', 'Permite traçar perímetros complexos vértice a vértice. Ao clicar sucessivamente nos cantos da máquina e retornar ao ponto inicial (ou dar duplo-clique), a área se fecha.');
  drawBullet('Criar Retângulo', 'Clique e arraste entre os cantos opostos para criar delimitações retangulares com geometria perfeita.');
  drawBullet('Pré-visualização Precisa', 'Durante a criação, o placeholder de auxílio visual acompanha fielmente a posição do cursor sem desvios angulares ou de escala.');

  drawSubSection('5.2. Alinhamento Magnético Inteligente (Snapping)');
  drawParagraph(
    'O editor conta com um recurso de atração magnética leve entre vértices e linhas ortogonais. Isso garante que áreas contíguas fiquem perfeitamente alinhadas sem esforço manual. Na barra de ferramentas do editor, o botão "Magnético: Ativado / Desativado" permite ligar ou desligar essa assistência a qualquer momento.'
  );

  drawSubSection('5.3. Seleção Múltipla com Tecla [CTRL]');
  drawParagraph(
    'Para gerenciar conjuntos de máquinas com agilidade, o editor implementa seleção múltipla avançada:'
  );
  drawBullet('Comando', 'Segure a tecla [CTRL] e clique sobre múltiplas áreas no mapa ou na lista.');
  drawBullet('Destaque Luminescente', 'Todas as áreas selecionadas recebem um contorno fluorescente de alta visibilidade com marcadores destacados nos vértices, distinguindo-as com clareza dos demais elementos.');
  drawBullet('Edição em Lote Contextual', 'Ao selecionar múltiplos elementos, as opções individuais irrelevantes no topo são ocultadas, abrindo diretamente a seção comum "Informações mostradas ao clicar no cadeado". As alterações de campos visíveis aplicam-se a todas as áreas selecionadas de uma só vez.');

  drawSubSection('5.4. Histórico de Edição: Desfazer (Ctrl+Z) e Refazer (Ctrl+Y)');
  drawParagraph(
    'O editor registra até 10 etapas consecutivas de ações em sua memória. Erros de movimentação de vértices, exclusões acidentais ou alterações de tamanho podem ser revertidos instantaneamente pelo atalho Ctrl + Z (ou avançados com Ctrl + Y), além dos botões dedicados na barra de ferramentas.'
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
    'A aba Registros reúne a totalidade dos eventos de isolamento de energia da fábrica, servindo como o livro eletrônico oficial de bloqueios e desenergizações.'
  );

  drawSubSection('6.1. Cadastro e Baixa de Bloqueios');
  drawBullet('Novo Registro', 'Acionado pelo botão superior "Novo registro". Permite selecionar o equipamento, setor, técnico responsável, data/hora da colocação do cadeado e o motivo do bloqueio.');
  drawBullet('Baixa / Desbloqueio', 'Ao concluir a atividade de manutenção e realizar o teste de liberação (Tryout), o operador edita o registro e informa a "Data de desbloqueio". O sistema remove o cadeado do mapa imediatamente e arquiva o registro como concluído.');

  drawSubSection('6.2. Filtros e Consulta');
  drawParagraph(
    'A tabela de registros conta com caixa de busca rápida por texto, filtros por setor, equipamento e status ("Todos os registros" ou "Somente bloqueios ativos"). O painel "Alterações recentes" permite consultar as movimentações realizadas nas últimas horas para agilizar trocas de turno.'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 7
  // -----------------------------------------------------------------------
  startChapter(
    '07',
    'Módulo: Importações de Planilhas Excel',
    'Integração em lote, mapeamento de colunas e salvamento de perfis'
  );

  drawParagraph(
    'Para plantas que gerenciam ordens de serviço no SAP, TOTVS ou Excel, o EasyLOTOTO v2 oferece um módulo de importação robusto com validação prévia.'
  );

  drawStepWorkflow([
    { title: 'Upload', desc: 'Carregue o arquivo .xlsx ou .csv no sistema.' },
    { title: 'Mapeamento', desc: 'Vincule as colunas da planilha aos campos LOTOTO.' },
    { title: 'Validação', desc: 'Inspecione a prévia e cheque inconsistências.' },
    { title: 'Gravação', desc: 'Grave os registros com prevenção de duplicação.' },
  ]);

  drawSubSection('7.1. Perfis de Importação Salvos');
  drawParagraph(
    'Quando a mesma estrutura de planilha é importada rotineiramente, o operador pode salvar o mapeamento com um nome personalizado (ex: "Exportação Diária Manutenção"). Em importações futuras, basta selecionar o perfil salvo para que todas as colunas sejam associadas automaticamente.'
  );

  drawSubSection('7.2. Algoritmo Antiduplicação e Desfazer Importação');
  drawParagraph(
    'O sistema gera uma assinatura hash única para cada linha importada. Caso o mesmo arquivo seja reenviado acidentalmente, linhas idênticas são desconsideradas. Além disso, cada lote importado é registrado na aba Histórico com a opção de reversão ("Desfazer importação"), apagando com segurança apenas os registros daquele lote.'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 8
  // -----------------------------------------------------------------------
  startChapter(
    '08',
    'Campos Personalizados, KPIs e Editor de Código',
    'Customização de atributos, indicadores gerenciais e novo editor Dark'
  );

  drawParagraph(
    'O EasyLOTOTO v2 permite adaptar os formulários da fábrica criando campos customizados (Texto, Número, Data ou Seleção) e atribuindo papéis de sistema (como equipamento, setor, bloqueado_por, locked_at e unlocked_at).'
  );

  drawSubSection('8.1. Novo Editor de Expressões em Tema Escuro (Dark Theme)');
  drawParagraph(
    'Todos os campos de inserção de código lógico e expressões matemáticas receberam o novo padrão de IDE com Tema Escuro:'
  );
  drawBullet('Numeração e Indentação', 'Facilita a visualização de fórmulas complexas com múltiplas condições.');
  drawBullet('Contraste e Cores de Sintaxe', 'Palavras-chave e variáveis são coloridas com alta legibilidade. Colchetes [campo] e aspas duplas "texto" contam com cores nítidas sobre o fundo escuro, evitando erros comuns de digitação.');
  drawBullet('Autocomplete Integrado', 'Ao digitar "[" ou nomes de comandos, o editor apresenta um menu flutuante sugerindo campos cadastrados no banco e funções nativas (hoursOf, isEmpty, count, etc.).');

  drawCodeSnippet('Filtro de Cadeado LOTOTO por Equipamento', '[equipamento] == "Torno CNC 02" && isEmpty([data_desbloqueio])');
  drawCodeSnippet('Fórmula de KPI para Bloqueios Prolongados', 'count(hoursOf([data_bloqueio]) > 48 && isEmpty([data_desbloqueio]))');

  // -----------------------------------------------------------------------
  // CAPÍTULO 9
  // -----------------------------------------------------------------------
  startChapter(
    '09',
    'Módulo: Relatórios Gerenciais e Análises',
    'Cronogramas de Gantt, relatórios executivos em PDF e exportação Excel'
  );

  drawParagraph(
    'A aba Relatórios transforma os registros de bloqueio em relatórios analíticos para lideranças de manutenção e segurança do trabalho.'
  );

  drawSubSection('9.1. Diagrama de Gantt Temporal de Bloqueios');
  drawParagraph(
    'O diagrama de Gantt plota cada isolamento energético em uma linha do tempo horizontal contínua. Essa ferramenta visual permite identificar sobreposições de equipes em um mesmo setor e monitorar a evolução dos tempos de liberação de máquinas.'
  );

  drawSubSection('9.2. Relatórios Executivos em PDF e Excel');
  drawBullet('Relatório PDF A4 Paisagem', 'Exporta relatórios formatados profissionalmente para afixação em quadros de gestão à vista, trazendo cabeçalho, autor ("Mapa de bloqueios LOTOTO") e paginação.');
  drawBullet('Planilhas Excel (.xlsx)', 'O botão "Exportar registros (Excel)" gera o arquivo com nomenclatura padronizada registros-lototo-AAAAMMDD.xlsx, estruturado com colunas congeladas para processamento em BI.');

  // -----------------------------------------------------------------------
  // CAPÍTULO 10
  // -----------------------------------------------------------------------
  startChapter(
    '10',
    'Backups, Sincronização Dinâmica e Área de Risco',
    'Preservação de dados, transmissão óptica por QR Code e Área de Risco'
  );

  drawParagraph(
    'O módulo de Backup e Governança reúne ferramentas para proteção de dados, cópias de segurança e transferências seguras entre estações.'
  );

  drawSubSection('10.1. Backups Locais em Arquivo (.zip)');
  drawBullet('Modo Somente Dados', 'Exporta registros de bloqueio e histórico de importações.');
  drawBullet('Modo Dados + Configurações (Completo)', 'Exporta plantas, imagens, áreas, campos, KPIs e ajustes. Possui opção de incluir usuários e senhas criptografadas para clonagem de estação.');
  drawBullet('Rotatividade Automática', 'O servidor gera backups automáticos diários e retém os últimos 14 arquivos no disco local.');

  drawSubSection('10.2. Sincronização Dinâmica por Código Visual (Online <-> Offline)');
  drawParagraph(
    'Para ambientes industriais sem conexão de rede entre a fábrica e a matriz corporativa, o EasyLOTOTO v2 conta com a Sincronização Óptica Dinâmica:'
  );
  drawBullet('Transmissão Rápida em Modal', 'Ao clicar em "Iniciar Processo de Sincronização", abre-se um modal dedicado que transmite os dados compactados em um fluxo de QR Codes de alta cadência.');
  drawBullet('Leitor Óptico via Câmera', 'Na estação de destino, acione "Receber sincronização" -> "Abrir leitor da câmera" e aponte para a outra tela para capturar e validar o pacote.');
  drawBullet('Transferência Manual por Texto', 'Permite também copiar o código compactado e colar manualmente no destino via área de transferência (Ctrl+C / Ctrl+V).');

  drawSubSection('10.3. A Guia "Conta" e a Área de Risco');
  drawParagraph(
    'Localizada na aba de backup, a guia "Conta" dispõe de funções de limpeza profunda, desenhada sob padrão de alto contraste (sem degradês escuros):'
  );
  drawBullet('Excluir Dados', 'Apaga todos os registros de bloqueio, mantendo intactas as plantas, áreas e campos.');
  drawBullet('Excluir Dados + Configurações', 'Limpa o ambiente e redefine o sistema para o padrão inicial, preservando as contas de usuários e senhas.');
  drawBullet('Excluir Backups', 'Apaga os arquivos .zip antigos salvos na pasta local do servidor para liberar espaço.');
  drawBullet('Confirmação por Palavra-Chave', 'Exige a digitação exata da chave correspondente ("EXCLUIR DADOS", "EXCLUIR TUDO" ou "EXCLUIR BACKUPS") para evitar qualquer operação acidental.');

  // -----------------------------------------------------------------------
  // CAPÍTULO 11
  // -----------------------------------------------------------------------
  startChapter(
    '11',
    'Configurações Gerais e Auditoria do Sistema',
    'Parametrização global de regras de bloqueio e trilha de auditoria'
  );

  drawParagraph(
    'A aba Configurações centraliza a parametrização do motor de regras e a fiscalização de eventos operacionais.'
  );

  drawSubSection('11.1. Definição da Regra de Bloqueio Ativo');
  drawParagraph(
    'O critério que define se um registro representa um bloqueio ativo na fábrica é configurável por expressão. O padrão adotado é isEmpty([data_desbloqueio]), significando que enquanto não houver data e hora de desbloqueio registradas, a máquina permanecerá sinalizada com o cadeado LOTOTO.'
  );

  drawSubSection('11.2. Pasta Externa de Redundância');
  drawParagraph(
    'É possível apontar uma pasta em um segundo disco ou compartilhamento de rede corporativa (ex: \\\\servidor\\backups_lototo ou D:\\Backups\\LOTOTO). O botão "Testar pasta" valida as permissões de escrita antes da gravação.'
  );

  drawSubSection('11.3. Trilha de Auditoria (Audit Log)');
  drawParagraph(
    'Todas as alterações no sistema (criação e exclusão de bloqueios, alterações de layout, logins, importações e ações na área de risco) são registradas com data, hora, usuário e detalhe, permitindo auditorias técnicas completas.'
  );

  // -----------------------------------------------------------------------
  // CAPÍTULO 12
  // -----------------------------------------------------------------------
  startChapter(
    '12',
    'Guia Rápido, Teclas de Atalho e FAQ',
    'Matriz de comandos, procedimentos de contingência e boas práticas'
  );

  drawParagraph(
    'A tabela a seguir consolida as teclas de atalho e comandos de mouse essenciais para máxima produtividade:'
  );

  const shortcutHeaders = ['Comando / Tecla', 'Módulo de Uso', 'Ação / Efeito'];
  const shortcutRows = [
    ['Ctrl + Z', 'Editor de Plantas e Áreas', 'Desfaz a última alteração (histórico de até 10 etapas).'],
    ['Ctrl + Y', 'Editor de Plantas e Áreas', 'Refaz a alteração que havia sido desfeita.'],
    ['Tecla [CTRL] + Clique', 'Editor de Plantas e Áreas', 'Seleciona múltiplas áreas para edição em lote.'],
    ['Roda do Mouse (Scroll)', 'Mapa da fábrica / Editor', 'Aplica zoom in / out suave na coordenada do ponteiro.'],
    ['Arrastar (Botão Esquerdo)', 'Mapa da fábrica', 'Navega (Pan) pela extensão da planta industrial.'],
    ['Duplo-clique na Área', 'Mapa da fábrica', 'Aproxima e centraliza a visualização no equipamento.'],
    ['Clique no Fundo da Planta', 'Editor de Plantas e Áreas', 'Desmarca áreas e exibe configurações globais da planta.'],
    ['Botão Magnético', 'Barra do Editor', 'Ativa/Desativa atração magnética de vértices no desenho.'],
    ['Login "recovery"', 'Tela de Login', 'Acesso seguro de contingência com perfil de administrador.'],
  ];
  drawTable(shortcutHeaders, shortcutRows, [130, 150, 235]);

  drawSubSection('12.1. Perguntas Frequentes (FAQ)');
  drawBullet(
    'Esqueci a senha do administrador. Como recuperar o acesso?',
    'Acesse a tela de login e entre com o usuário "recovery" e senha "1234Abcd". O sistema abrirá com perfil de Administrador, permitindo acessar a aba "Usuários" para redefinir as senhas dos colaboradores.'
  );

  drawBullet(
    'Por que a conta "recovery" não aparece na lista de usuários?',
    'Por estritos critérios de segurança, a conta de contingência é programada para ser invisível nas interfaces visuais, prevenindo alterações inadvertidas ou exclusões.'
  );

  drawBullet(
    'Como disponibilizar a visualização do mapa da fábrica sem login para totens?',
    'Acesse a aba "Usuários" (ou Configurações) e ative a chave "Visualização pública". Isso permitirá que computadores de chão de fábrica e totens exibam a planta interativa com cadeados sem solicitar senha, mantendo bloqueadas as telas de edição e cadastro.'
  );

  checkSpace(60);
  doc.y += 12;
  doc.moveTo(M, doc.y).lineTo(PAGE_W - M, doc.y).lineWidth(0.8).strokeColor(C.GRAY_LINE).stroke();
  doc.y += 10;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.NAVY);
  doc.text('EasyLOTOTO v2 — Sistema de Gestão Visual de Bloqueios e Etiquetagens LOTOTO.', M, doc.y, { align: 'center', width: CONTENT_W });
  doc.font('Helvetica').fontSize(8).fillColor(C.TEXT_MUTED);
  doc.text('Documento oficial emitido pelo núcleo de documentação do EasyLOTOTO v2.', M, doc.y + 4, { align: 'center', width: CONTENT_W });
}

// =========================================================================
// 4. PREENCHIMENTO DO SUMÁRIO (PÁGINA 2) COM OS NÚMEROS REAIS
// =========================================================================
function fillTableOfContents() {
  doc.switchToPage(1); // Página 2 (índice 1)
  doc.y = TOP_MARGIN;

  doc.font('Helvetica-Bold').fontSize(16).fillColor(C.NAVY);
  doc.text('Sumário do Manual Técnico', M, doc.y);
  doc.y += 4;
  doc.moveTo(M, doc.y).lineTo(PAGE_W - M, doc.y).lineWidth(1).strokeColor(C.BLUE_PRIMARY).stroke();
  doc.y += 14;

  chapterRegistry.forEach((ch) => {
    const y = doc.y;

    // Número
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.ORANGE_SIGNAL);
    doc.text(ch.number, M, y, { width: 22 });

    // Título
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.TEXT_TITLE);
    doc.text(ch.title, M + 26, y, { width: CONTENT_W - 75 });

    // Página
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.BLUE_PRIMARY);
    doc.text(`Pág. ${ch.pageNum}`, M + CONTENT_W - 45, y, { width: 45, align: 'right' });

    // Subtítulo
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
    'Terminologia Padronizada: LOTO vs LOTOTO',
    'O EasyLOTOTO v2 adota em todas as interfaces, relatórios e manuais a sigla "LOTOTO" (Lockout, Tagout, Tryout), enfatizando a obrigatoriedade da etapa de Teste de Energia Zero antes de qualquer intervenção em máquinas e equipamentos industriais.'
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

    // Página 1 (Capa): sem cabeçalho e sem rodapé
    if (i === 0) continue;

    const oldTop = doc.page.margins.top;
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.top = 0;
    doc.page.margins.bottom = 0;

    // Cabeçalho Superior
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.BLUE_PRIMARY);
    doc.text('EasyLOTOTO v2', M, 24, { lineBreak: false });

    doc.font('Helvetica').fontSize(7.5).fillColor(C.TEXT_MUTED);
    doc.text('•  Manual Técnico de Operação', M + 75, 24, { lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.NAVY);
    doc.text('Mapa da fábrica', PAGE_W - M - 100, 24, { width: 100, align: 'right', lineBreak: false });

    doc.moveTo(M, 36).lineTo(PAGE_W - M, 36).lineWidth(0.5).strokeColor(C.GRAY_LINE).stroke();

    // Rodapé Inferior
    doc.moveTo(M, PAGE_H - 34).lineTo(PAGE_W - M, PAGE_H - 34).lineWidth(0.5).strokeColor(C.GRAY_LINE).stroke();

    doc.font('Helvetica').fontSize(7.5).fillColor(C.TEXT_MUTED);
    doc.text('EasyLOTOTO v2 • Sistema de Gestão Visual de Bloqueios e Etiquetagens LOTOTO', M, PAGE_H - 26, { lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.NAVY);
    doc.text(`Página ${i + 1} de ${totalPages}`, PAGE_W - M - 90, PAGE_H - 26, { width: 90, align: 'right', lineBreak: false });

    doc.page.margins.top = oldTop;
    doc.page.margins.bottom = oldBottom;
  }
}

// =========================================================================
// EXECUÇÃO DO FLUXO COMPLETO
// =========================================================================
console.log('Iniciando compilação do Manual de Uso do EasyLOTOTO v2 em PDF...');
buildCoverPage();
reserveTocPage();
buildChapters();
fillTableOfContents();
applyHeaderAndFooter();

doc.end();

writeStream.on('finish', () => {
  const stats = fs.statSync(outputPath);
  console.log('Manual Técnico compilado com sucesso!');
  console.log(`Arquivo: ${outputPath}`);
  console.log(`Tamanho: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`Páginas totais: ${chapterRegistry[chapterRegistry.length - 1]?.pageNum || 'OK'}`);
});
