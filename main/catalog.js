// Classificação e resumo locais. Texto original é preservado quando não há tradução segura.
const CATEGORIES = ['Mobile', 'Web', 'Design', 'Banco de Dados', 'Segurança', 'Automação', 'Testes', 'IA', 'Outros'];
const RULES = [
  ['Mobile', /react native|\bexpo\b|\bandroid\b|\bios\b|\bmobile\b|aplicativ[oa] m[oó]vel/iu],
  ['Banco de Dados', /supabase|postgres|\bsql\b|database|banco de dados|\bmysql\b|\bmongodb\b/iu],
  ['Segurança', /security|seguran[cç]a|authentication|autentica[cç][aã]o|\bauth\b|vulnerabilit/iu],
  ['Automação', /automation|automa[cç][aã]o|\bworkflow\b|fluxo de trabalho|agendament/iu],
  ['Testes', /\btests?\b|\btesting\b|\bdebug(?:ging)?\b|testes|depura[cç][aã]o/iu],
  ['IA', /\bllm\b|intelig[eê]ncia artificial|machine learning|\bai\b|\bia\b|prompt engineering/iu],
  ['Design', /\bdesign\b|\bui\b|\bux\b|typography|tipografia|acessibilidade|accessibility/iu],
  ['Web', /website|web app|\bweb\b|frontend|front-end|\bnext\.js\b|\bhtml\b|\bcss\b/iu]
];
const REVIEW = 'Precisa de revisão';
function categoryFor(skill) {
  const segments = [skill.name || '', skill.title || '', skill.description || '', skill.raw?.slice(0, 16000) || ''];
  const name = `${segments[0]} ${segments[1]}`;
  for (const [category, pattern] of RULES) if (pattern.test(name) && category !== 'Web') return category;
  const scores = new Map(CATEGORIES.map(x => [x, 0]));
  for (const [category, pattern] of RULES) for (let i = 0; i < segments.length; i++) if (pattern.test(segments[i])) scores.set(category, scores.get(category) + [7, 5, 4, 1][i]);
  let best = 'Outros', points = 0;
  for (const category of CATEGORIES) if (scores.get(category) > points) { best = category; points = scores.get(category); }
  return best;
}
function isPortuguese(text) { return /\b(para|quando|criar|revisar|ajuda|dados|interface|us[ae]|aplicativo|tarefa|c[oó]digo|construir)\b/iu.test(text); }
function clean(text) { return String(text || '').replace(/\s+/g, ' ').trim().replace(/^[-*]\s*/, ''); }
function firstSentence(text) { return clean(text).split(/(?<=[.!?])\s+/u)[0].slice(0, 240); }
function purpose(skill) {
  const desc = clean(skill.description);
  if (!desc || /^(descreva|todo|tbd|skill de teste)/i.test(desc) || desc.length < 12) return REVIEW;
  if (isPortuguese(desc)) return firstSentence(desc);
  if (/^create database tables\b/i.test(desc)) return 'Ajuda a criar tabelas de banco de dados.';
  if (/^review UI code for Web Interface Guidelines compliance/i.test(desc)) return 'Revisa código de interface conforme diretrizes de design e acessibilidade.';
  // Não inventar tradução de uma descrição desconhecida.
  return firstSentence(desc);
}
function usage(skill) {
  const desc = clean(skill.description);
  const match = desc.match(/\b(?:use when|when (?:building|creating|working|using|asked|developing|implementing|reviewing|optimizing|they|you|the user))\b[^.!?]*/i);
  if (match) return clean(match[0]).slice(0, 240);
  const body = skill.raw?.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---/, '').slice(0, 24000) || '';
  const section = body.match(/^#{1,4}\s*(?:Quando usar|When to (?:Use|Apply)|Use Cases|Casos de uso)[^\n]*\r?\n([\s\S]*?)(?=^#{1,4}\s|(?![\s\S]))/im)?.[1] || '';
  const lines = section.split(/\r?\n/).map(clean).filter(x => x && !/^#/.test(x));
  if (lines[0]?.endsWith(':') && lines[1]) return `${lines[0]} ${lines[1]}`.slice(0, 240);
  return lines[0] ? lines[0].slice(0, 240) : REVIEW;
}
function enrichEntry(entry, skill) {
  const next = { ...entry };
  if (!next.paraQueServeManual && !clean(next.paraQueServe)) next.paraQueServe = purpose(skill);
  if (!next.quandoUsarManual && !clean(next.quandoUsar)) next.quandoUsar = usage(skill);
  if (!next.categoria || !CATEGORIES.includes(next.categoria)) next.categoria = categoryFor(skill);
  else if (!next.categoriaManual) next.categoria = categoryFor(skill);
  return next;
}
module.exports = { CATEGORIES, REVIEW, categoryFor, purpose, usage, enrichEntry };
