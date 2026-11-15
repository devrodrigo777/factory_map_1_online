import { useEffect, useState } from 'react';
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

/**
 * Campo de expressão com teste ao vivo (quantos registros correspondem)
 * e montador de condições a partir dos campos e valores existentes.
 */
export default function ExprInput({ value, onChange, fields = [], rows = 2, placeholder, builder = true }) {
  const [test, setTest] = useState(null);
  const [fieldKey, setFieldKey] = useState('');
  const [values, setValues] = useState([]);
  const [val, setVal] = useState('');

  useEffect(() => {
    if (!value.trim()) { setTest(null); return; }
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
      <textarea rows={rows} value={value} placeholder={placeholder} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
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
