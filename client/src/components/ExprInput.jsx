import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

const HELP = [
  ['[Campo]', 'valor de um campo (pelo nome)'],
  ['ativo', 'verdadeiro se o bloqueio está ativo'],
  ['== != < > <= >=', 'comparações (texto sem diferenciar maiúsculas/acentos)'],
  ['and  or  not', 'combinam condições (também: e, ou, nao)'],
  ['isEmpty(x)', 'campo vazio'],
  ['contains(x, "texto")', 'contém o texto'],
  ['oneOf(x, "A", "B")', 'é um dos valores'],
  ['between(x, a, b)', 'entre dois valores'],
  ['daysSince(data)', 'dias desde a data (hoursSince para horas)'],
  ['diffDays(a, b)', 'dias de a até b (diffHours para horas)'],
  ['year(d) month(d) day(d)', 'partes de uma data'],
  ['if(cond, a, b)', 'escolhe entre dois valores'],
  ['coalesce(a, b)', 'primeiro valor preenchido'],
  ['round(n, casas)  abs  min  max', 'números'],
  ['split(texto, ";")', 'separa texto em lista por delimitador'],
  ['trim(texto)', 'remove espaços nas pontas (ou de cada item)'],
  ['today()  now()', 'data de hoje / agora'],
];

const BUILTIN_SUGGESTIONS = [
  { name: 'split', type: 'func', insert: 'split()', cursorOffset: 6, sig: 'split(texto, ";")', doc: 'Separa texto em lista por delimitador' },
  { name: 'trim', type: 'func', insert: 'trim()', cursorOffset: 5, sig: 'trim(texto)', doc: 'Remove espaços vazios nas pontas' },
  { name: 'if', type: 'func', insert: 'if(, , )', cursorOffset: 3, sig: 'if(cond, entao, senao)', doc: 'Retorna um valor se verdadeiro, outro se falso' },
  { name: 'isEmpty', type: 'func', insert: 'isEmpty()', cursorOffset: 8, sig: 'isEmpty(campo)', doc: 'Verdadeiro se o campo estiver vazio' },
  { name: 'contains', type: 'func', insert: 'contains(, "")', cursorOffset: 9, sig: 'contains(campo, "texto")', doc: 'Verdadeiro se contém o texto' },
  { name: 'oneOf', type: 'func', insert: 'oneOf(, "")', cursorOffset: 6, sig: 'oneOf(campo, "A", "B")', doc: 'Verdadeiro se for um dos valores' },
  { name: 'between', type: 'func', insert: 'between(, , )', cursorOffset: 8, sig: 'between(campo, min, max)', doc: 'Verdadeiro se estiver entre min e max' },
  { name: 'daysSince', type: 'func', insert: 'daysSince()', cursorOffset: 10, sig: 'daysSince(data)', doc: 'Dias decorridos desde a data' },
  { name: 'hoursSince', type: 'func', insert: 'hoursSince()', cursorOffset: 11, sig: 'hoursSince(data)', doc: 'Horas decorridas desde a data' },
  { name: 'diffDays', type: 'func', insert: 'diffDays(, )', cursorOffset: 9, sig: 'diffDays(inicio, fim)', doc: 'Diferença em dias entre duas datas' },
  { name: 'diffHours', type: 'func', insert: 'diffHours(, )', cursorOffset: 10, sig: 'diffHours(inicio, fim)', doc: 'Diferença em horas entre duas datas' },
  { name: 'year', type: 'func', insert: 'year()', cursorOffset: 5, sig: 'year(data)', doc: 'Ano de uma data' },
  { name: 'month', type: 'func', insert: 'month()', cursorOffset: 6, sig: 'month(data)', doc: 'Mês de uma data (1-12)' },
  { name: 'day', type: 'func', insert: 'day()', cursorOffset: 4, sig: 'day(data)', doc: 'Dia do mês de uma data (1-31)' },
  { name: 'coalesce', type: 'func', insert: 'coalesce(, )', cursorOffset: 9, sig: 'coalesce(a, b)', doc: 'Primeiro valor preenchido' },
  { name: 'round', type: 'func', insert: 'round(, 0)', cursorOffset: 6, sig: 'round(n, casas)', doc: 'Arredonda número para casas decimais' },
  { name: 'abs', type: 'func', insert: 'abs()', cursorOffset: 4, sig: 'abs(n)', doc: 'Valor absoluto (positivo)' },
  { name: 'min', type: 'func', insert: 'min(, )', cursorOffset: 4, sig: 'min(a, b)', doc: 'Menor valor' },
  { name: 'max', type: 'func', insert: 'max(, )', cursorOffset: 4, sig: 'max(a, b)', doc: 'Maior valor' },
  { name: 'today', type: 'func', insert: 'today()', cursorOffset: 7, sig: 'today()', doc: 'Data atual de hoje' },
  { name: 'now', type: 'func', insert: 'now()', cursorOffset: 5, sig: 'now()', doc: 'Data e hora atuais' },
  { name: 'ativo', type: 'kw', insert: 'ativo ', cursorOffset: 6, sig: 'ativo', doc: 'Verdadeiro se o registro de bloqueio estiver ativo' },
  { name: 'and', type: 'kw', insert: 'and ', cursorOffset: 4, sig: 'and', doc: 'Operador lógico E' },
  { name: 'or', type: 'kw', insert: 'or ', cursorOffset: 3, sig: 'or', doc: 'Operador lógico OU' },
  { name: 'not', type: 'kw', insert: 'not ', cursorOffset: 4, sig: 'not', doc: 'Operador lógico NÃO' },
];

export function tokenizeCode(code) {
  if (!code) return [];
  const regex = /("(?:\\.|[^"\\])*(?:"|$)|'(?:\\.|[^'\\])*(?:'|$)|\[[^\]\r\n]*(?:\]|$)|\]|==|!=|<=|>=|<|>|\+|-|\*|\/|\b(?:ativo|and|or|not|e|ou|nao|true|false|null)\b|\b(?:split|trim|if|isEmpty|contains|oneOf|between|daysSince|hoursSince|diffDays|diffHours|year|month|day|coalesce|round|abs|min|max|today|now)\b|\b\d+(?:\.\d+)?\b|[(),;]|\s+|\w+|[^\s\w])/gi;

  const tokens = [];
  let match;
  while ((match = regex.exec(code)) !== null) {
    const text = match[0];
    let type = 'plain';

    if (text.startsWith('"') || text.startsWith("'")) {
      type = 'string';
    } else if (text.startsWith('[') || text === ']') {
      type = 'field';
    } else if (/^(ativo|and|or|not|e|ou|nao|true|false|null)$/i.test(text)) {
      type = 'keyword';
    } else if (/^(split|trim|if|isEmpty|contains|oneOf|between|daysSince|hoursSince|diffDays|diffHours|year|month|day|coalesce|round|abs|min|max|today|now)$/i.test(text)) {
      type = 'function';
    } else if (/^\d+(?:\.\d+)?$/.test(text)) {
      type = 'number';
    } else if (/^(==|!=|<=|>=|<|>|\+|-|\*|\/)$/.test(text)) {
      type = 'operator';
    } else if (/^[(),;]$/.test(text)) {
      type = 'punctuation';
    }

    tokens.push({ text, type });
  }
  return tokens;
}

/**
 * Editor de código para expressões com destaque sintático, numeração de linhas,
 * suporte a indentação por tecla Tab, autocomplete inteligente e testes ao vivo.
 */
export default function ExprInput({ value = '', onChange, fields = [], rows = 2, placeholder, builder = true }) {
  const [test, setTest] = useState(null);
  const [fieldKey, setFieldKey] = useState('');
  const [values, setValues] = useState([]);
  const [val, setVal] = useState('');

  const [suggestions, setSuggestions] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  const gutterRef = useRef(null);

  // Teste ao vivo da expressão digitada
  useEffect(() => {
    if (!value || !value.trim()) { setTest(null); return; }
    let stop = false;
    const t = setTimeout(() => {
      api.testExpr(value).then((r) => !stop && setTest(r)).catch(() => {});
    }, 450);
    return () => { stop = true; clearTimeout(t); };
  }, [value]);

  useEffect(() => {
    setVal('');
    if (!fieldKey) { setValues([]); return; }
    let stop = false;
    api.fieldValues(fieldKey).then((v) => !stop && setValues(v)).catch(() => setValues([]));
    return () => { stop = true; };
  }, [fieldKey]);

  const tokens = useMemo(() => tokenizeCode(value || ''), [value]);
  const linesCount = Math.max((value || '').split('\n').length, rows || 2);
  const lineNumbers = Array.from({ length: linesCount }, (_, i) => i + 1);

  // Monitora digitação para acionar autocomplete contextual
  const updateSuggestions = (text, cursorPos) => {
    const beforeCursor = text.slice(0, cursorPos);

    // Caso 1: Usuário digitou [ ou está dentro de colchete de campo
    const lastOpenBracket = beforeCursor.lastIndexOf('[');
    const lastCloseBracket = beforeCursor.lastIndexOf(']');
    if (lastOpenBracket > lastCloseBracket) {
      const fieldQuery = beforeCursor.slice(lastOpenBracket + 1).toLowerCase();
      const fieldItems = (fields || [])
        .filter((f) => f.label.toLowerCase().includes(fieldQuery))
        .map((f) => ({
          name: f.label,
          type: 'field',
          insert: `[${f.label}] `,
          cursorOffset: f.label.length + 3,
          replaceStart: lastOpenBracket,
          sig: `[${f.label}]`,
          doc: `Campo (${f.type || 'texto'}${f.computed ? ' - calculado' : ''})`,
        }));
      setSuggestions(fieldItems);
      setSelectedIdx(0);
      return;
    }

    // Caso 2: Palavra em digitação (letras/números/underline)
    const wordMatch = beforeCursor.match(/([a-zA-Z0-9_]+)$/);
    if (!wordMatch || wordMatch[1].length < 1) {
      setSuggestions([]);
      return;
    }
    const query = wordMatch[1].toLowerCase();
    const wordStart = cursorPos - wordMatch[1].length;

    const matchedBuiltins = BUILTIN_SUGGESTIONS
      .filter((s) => s.name.toLowerCase().startsWith(query))
      .map((s) => ({ ...s, replaceStart: wordStart }));

    const matchedFields = (fields || [])
      .filter((f) => f.label.toLowerCase().includes(query))
      .map((f) => ({
        name: f.label,
        type: 'field',
        insert: `[${f.label}] `,
        cursorOffset: f.label.length + 3,
        replaceStart: wordStart,
        sig: `[${f.label}]`,
        doc: `Campo (${f.type || 'texto'}${f.computed ? ' - calculado' : ''})`,
      }));

    const combined = [...matchedBuiltins, ...matchedFields].slice(0, 8);
    setSuggestions(combined);
    setSelectedIdx(0);
  };

  const applySuggestion = (sug) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const curVal = value || '';
    const start = sug.replaceStart !== undefined ? sug.replaceStart : textarea.selectionStart;
    const end = textarea.selectionEnd;

    const newVal = curVal.slice(0, start) + sug.insert + curVal.slice(end);
    onChange(newVal);
    setSuggestions([]);

    const newCursor = start + sug.cursorOffset;
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  };

  const handleKeyDown = (e) => {
    // Teclas no menu de autocomplete
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(suggestions[selectedIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestions([]);
        return;
      }
    }

    const textarea = textareaRef.current;
    if (!textarea) return;

    // Tecla Tab para identação profissional (2 espaços)
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const curVal = value || '';

      if (e.shiftKey) {
        // Desidentar se houver 2 espaços imediatamente antes
        const before = curVal.slice(0, start);
        if (before.endsWith('  ')) {
          const newVal = curVal.slice(0, start - 2) + curVal.slice(start);
          onChange(newVal);
          setTimeout(() => {
            textarea.setSelectionRange(start - 2, end - 2);
          }, 0);
        }
      } else {
        // Indentar: insere 2 espaços
        const newVal = curVal.slice(0, start) + '  ' + curVal.slice(end);
        onChange(newVal);
        setTimeout(() => {
          textarea.setSelectionRange(start + 2, start + 2);
        }, 0);
      }
      return;
    }

    // Tecla Enter mantém a mesma identação da linha anterior
    if (e.key === 'Enter') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const curVal = value || '';
      const lineBefore = curVal.slice(0, start).split('\n').pop() || '';
      const matchIndent = lineBefore.match(/^\s*/);
      const indent = matchIndent ? matchIndent[0] : '';
      const insertion = '\n' + indent;
      const newVal = curVal.slice(0, start) + insertion + curVal.slice(end);
      onChange(newVal);
      setTimeout(() => {
        const nextPos = start + insertion.length;
        textarea.setSelectionRange(nextPos, nextPos);
      }, 0);
      return;
    }
  };

  const handleChange = (e) => {
    const nextVal = e.target.value;
    onChange(nextVal);
    updateSuggestions(nextVal, e.target.selectionStart);
  };

  const handleScroll = (e) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.target.scrollTop;
      highlightRef.current.scrollLeft = e.target.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.target.scrollTop;
    }
  };

  const field = fields.find((f) => f.key === fieldKey);
  const addCondition = () => {
    if (!field) return;
    const lit = field.type === 'number' && val !== '' && !Number.isNaN(Number(val)) ? val : `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    const cond = `[${field.label}] == ${lit}`;
    onChange(value.trim() ? `${value.trim()} and ${cond}` : cond);
    setVal('');
  };

  return (
    <div className="expr">
      <div className="code-editor-container">
        {/* Régua de numeração de linhas */}
        <div className="code-editor-gutter" ref={gutterRef} aria-hidden="true">
          {lineNumbers.map((num) => (
            <div key={num} className="code-line-num">{num}</div>
          ))}
        </div>

        {/* Corpo de edição e destaque */}
        <div className="code-editor-viewport">
          <pre ref={highlightRef} className="code-editor-highlight" aria-hidden="true">
            {tokens.map((tok, idx) => (
              <span key={idx} className={`tok-${tok.type}`}>{tok.text}</span>
            ))}
            {(value || '').endsWith('\n') ? ' ' : ''}
          </pre>

          <textarea
            ref={textareaRef}
            className={`code-editor-textarea ${!value ? 'is-empty' : ''}`}
            rows={rows}
            value={value}
            placeholder={placeholder || 'Digite a expressão...'}
            spellCheck={false}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            onClick={(e) => updateSuggestions(value, e.target.selectionStart)}
            onKeyUp={(e) => {
              if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                updateSuggestions(value, e.target.selectionStart);
              }
            }}
            onBlur={() => {
              // Pequeno delay para permitir o clique nas opções do autocomplete
              setTimeout(() => setSuggestions([]), 200);
            }}
          />
        </div>

        {/* Menu suspenso de autocomplete inteligente */}
        {suggestions.length > 0 && (
          <div className="code-autocomplete" role="listbox">
            {suggestions.map((sug, idx) => (
              <div
                key={idx}
                role="option"
                aria-selected={idx === selectedIdx}
                className={`code-autocomplete-item ${idx === selectedIdx ? 'active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(sug);
                }}
              >
                <span className={`code-tag tag-${sug.type}`}>
                  {sug.type === 'func' ? 'ƒ' : sug.type === 'field' ? 'campo' : 'regra'}
                </span>
                <span className="code-sug-name">{sug.sig}</span>
                <span className="code-sug-doc">{sug.doc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {test && (
        <p className={`expr-test ${test.ok ? 'ok' : 'err'}`} role="status">
          {test.ok
            ? `${test.matches} ${test.matches === 1 ? 'registro corresponde' : 'registros correspondem'} (${test.active} ativo${test.active === 1 ? '' : 's'}).`
            : test.error}
        </p>
      )}

      {builder && fields.length > 0 && (
        <div className="expr-builder">
          <select value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} aria-label="Campo">
            <option value="">Adicionar condição: campo…</option>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          {fieldKey && (
            <>
              <input list={`vals-${fieldKey}`} value={val} onChange={(e) => setVal(e.target.value)} placeholder="valor" aria-label="Valor" />
              <datalist id={`vals-${fieldKey}`}>{values.map((v) => <option key={v} value={v} />)}</datalist>
              <button type="button" className="btn" onClick={addCondition} disabled={val === ''}>Adicionar</button>
            </>
          )}
        </div>
      )}

      <details className="expr-help">
        <summary>Ajuda sobre expressões</summary>
        <dl>{HELP.map(([k, d]) => (<div key={k}><dt><code>{k}</code></dt><dd>{d}</dd></div>))}</dl>
      </details>
    </div>
  );
}
